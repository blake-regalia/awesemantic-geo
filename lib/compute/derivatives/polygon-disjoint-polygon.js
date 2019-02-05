
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
		'distance_closest',
		'distance_centroid',
		'distance_furthest',
	],
});

let s_type_a = process.argv[2];
let s_type_b = process.argv[3];

const local = require('classer').logger('disjoint');
const parallelize = require('../../util/parallelize');

let p_output = path.join(__dirname, `/../../../data/selects/${s_type_a}-nearby-disjoint-${s_type_b}.csv`);
mkdirp(path.dirname(p_output));
let ds_output = fs.createWriteStream(p_output);
y_csv.pipe(ds_output);

parallelize(`
	select
		i.a_osm_id,
		i.b_osm_id,
		i.a_dbr_id,
		i.b_dbr_id,
		i.a_polygons,
		i.b_polygons
	from nearby_disjoint_${s_type_a}_${s_type_b} i
	where true
`, 'm', (s_select) => {
	return `
		select
			m.a_osm_id,
			m.a_dbr_id,
			m.b_osm_id,
			m.b_dbr_id,
			st_distance(m.a_polygons::geography, m.b_polygons::geography, true) as distance_closest,
			st_distance(st_centroid(m.a_polygons)::geography, st_centroid(m.b_polygons)::geography, true) as distance_centroid,
			st_length(st_longestline(m.a_polygons, m.b_polygons)::geography, true) as distance_furthest
		from ${s_select}
		where true
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
			h_row.distance_closest,
			h_row.distance_centroid,
			h_row.distance_furthest,
		]);
	});
	local.info(`+${a_rows.length} results`);
}, () => {
	y_csv.end();
	local.good('done');
});
