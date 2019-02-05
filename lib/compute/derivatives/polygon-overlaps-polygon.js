
const fs = require('fs');
const path = require('path');

const mkdirp = require('mkdirp');
const csv = require('csv-write-stream');
const y_csv = csv({
	headers: [
		'a_osm_id',
		'a_dbr_id',
		'b_osm_id',
		'b_dbr_id',
		'intersection_area',
		'ap1',
		'ap2',
	],
});

let s_type_a = process.argv[2];
let s_type_b = process.argv[3];

const local = require('classer').logger('touches');
const parallelize = require('../util/parallelize');

let p_output = path.join(__dirname, `/../../data/selects/${s_type_a}-overlaps-${s_type_b}.csv`);
mkdirp(path.dirname(p_output));
let ds_output = fs.createWriteStream(p_output);
y_csv.pipe(ds_output);

parallelize(`
	select
		a0.osm_id,
		a0.dbr_id,
		a0.polygons
	from osm_polygons a0
	where a0.is_${s_type_a} = true
	and ST_IsValid(a0.polygons)
`, 'a', (s_select) => {
	return `
		with copy_rows as (
			select
				a.osm_id a_osm_id,
				a.dbr_id a_dbr_id,
				b.osm_id b_osm_id,
				b.dbr_id b_dbr_id,
				st_area(st_intersection(a.polygons, b.polygons)::geography) as intersection_area,
				st_area(st_intersection(a.polygons, b.polygons)::geography) / st_area(a.polygons) as ap1,
				st_area(st_intersection(a.polygons, b.polygons)::geography) / st_area(b.polygons) as ap2
			from ${s_select},
				osm_polygons b
			where st_overlaps(a.polygons, b.polygons)
				and a.dbr_id NOT LIKE b.dbr_id
				and a.osm_id NOT LIKE b.osm_id
				and st_isvalid(b.polygons)
				and b.is_${s_type_b} = true
				and st_area(a.polygons) <= st_area(b.polygons)
		) insert into ${s_type_a}_overlaps_${s_type_b}
		select * from copy_rows
		`;
}, (e_query, h_result, s_sql) => {
	if(e_query) {
		local.fail(s_sql+'\n\n'+e_query);
	}
	let a_rows = h_result.rows;
	a_rows.forEach((h_row) => {
		y_csv.write([
			h_row.a_osm_id,
			h_row.a_dbr_id,
			h_row.b_osm_id,
			h_row.b_dbr_id,
			h_row.intersection_area,
			h_row.ap1,
			h_row.ap2,
		]);
	});
	local.info(`+${a_rows.length} results`);
}, () => {
	y_csv.end();
	local.good('done');
});
