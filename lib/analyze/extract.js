
const fs = require('fs');
const path = require('path');

const pj = require('../util/pj');
const h_pg_config = require('../../database');
const db = pj(h_pg_config);

const mkdirp = require('mkdirp');
const csv = require('csv-write-stream');

let s_type_a = process.argv[2];
let s_relation = process.argv[3];
let s_type_b = process.argv[4];
const H_FIELDS = {
	touches: [
		'lib', 'lib_p1', 'lib_p2', 'lib_a1', 'lib_a2',
	],
	overlaps: [
		'ai', 'ai_a1', 'ai_a2', 'ad', 'ad_a1', 'ad_a2', 'lib', 'lib_p1', 'lib_p2'
	],
	disjoint: [
		'd',
	],
};

let a_fields = [
	'a.id',
	'b.id',
].concat(H_FIELDS[s_relation].map(s => 'z.'+s));

let a_aliases = a_fields.map(s => s.replace(/^c\./, '').replace(/\./g, '_'));

const y_csv = csv({
	headers: a_aliases,
	separator: '|',
});

let s_code = `${s_type_a}_${s_relation}_${s_type_b}`;
let p_output = path.join(__dirname, `/../../data/selects/${s_code}.csv`);
mkdirp(path.dirname(p_output));
let ds_output = fs.createWriteStream(p_output);
y_csv.pipe(ds_output);

db.from(`pg_${s_relation}_pg c
	left join pg_${s_relation}_pg_dirty z
		on c.z_id = z.id
	left join osm_polygons a
		on c.a_id = a.id
	left join osm_polygons b
		on c.b_id = b.id
`).where(`z.d >= 20
		and (
			(
				a.is_${s_type_a} = true
				and b.is_${s_type_b} = true
			) or
			(
				a.is_${s_type_b} = true
				and b.is_${s_type_a} = true
			)
		)
		order by z.d asc
	`)
.select(a_fields.map((s, i) => s+' '+a_aliases[i]).join(', '))
.exec((a_rows) => {
	a_rows.forEach((h_row) => {
		y_csv.write(a_aliases.map(s => h_row[s]));
	});

	y_csv.end();
});
