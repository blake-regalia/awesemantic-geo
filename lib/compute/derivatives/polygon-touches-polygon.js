
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
		'intersection_length',
		'rll_bigger',
		'rll_smaller',
		'rla_bigger',
		'rla_smaller',
	],
});

let s_type_a = process.argv[2];
let s_type_b = process.argv[3];

const local = require('classer').logger('touches');
const parallelize = require('../util/parallelize');

let p_output = path.join(__dirname, `/../../data/selects/${s_type_a}-touches-${s_type_b}.csv`);
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
				a.osm_id as a_osm_id,
				b.osm_id as b_osm_id,
				a.dbr_id as a_dbr_id,
				b.dbr_id as b_dbr_id,
				a.polygons as a_polygons,
				b.polygons as b_polygons,
				st_length(st_intersection(a.polygons, b.polygons)::geography) as intersection_length,
				st_length(st_intersection(a.polygons, b.polygons)::geography) / st_perimeter(a.polygons::geography) as rll_smaller,
				st_length(st_intersection(a.polygons, b.polygons)::geography) / st_perimeter(b.polygons::geography) as rll_bigger,
				st_length(st_intersection(a.polygons, b.polygons)::geography) / st_area(a.polygons::geography) as rla_smaller,
				st_length(st_intersection(a.polygons, b.polygons)::geography) / st_area(b.polygons::geography) as rla_bigger	
			from ${s_select},
				osm_polygons b
			where st_touches(a.polygons, b.polygons)
				and a.dbr_id NOT LIKE b.dbr_id
				and a.osm_id NOT LIKE b.osm_id
				and st_isvalid(b.polygons)
				and b.is_${s_type_b} = true
				and st_area(a.polygons) <= st_area(b.polygons)
		) insert into ${s_type_a}_touches_${s_type_b}
		select * from copy_rows
		`;
}, (e_query, h_result) => {
	if(e_query) {
		local.fail(e_query);
	}
	let a_rows = h_result.rows;
	a_rows.forEach((h_row) => {
		y_csv.write([
			h_row.a_osm_id,
			h_row.a_dbr_id,
			h_row.b_osm_id,
			h_row.b_dbr_id,
			h_row.intersection_length,
			h_row.rll_bigger,
			h_row.rll_smaller,
			h_row.rla_bigger,
			h_row.rla_smaller,
		]);
	});
	local.info(`+${a_rows.length} results`);
}, () => {
	y_csv.end();
	local.good('done');
});
