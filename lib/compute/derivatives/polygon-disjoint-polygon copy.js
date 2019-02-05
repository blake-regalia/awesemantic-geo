const async = require('async');
const local = require('classer').logger('touches');
const parallelize = require('../util/parallelize');

const pj = require('../util/pj');
const h_pg_config = require('../../database');
const db = pj(h_pg_config);

let s_code = 'polygon_disjoint_polygon';

let h_metric = {
	selects: {
		// distance
		d: 'st_distance(a_polygons::geography, b_polygons::geography, true)',
		d_p1: 'st_distance(a_polygons::geography, b_polygons::geography, true) / st_perimeter(a_polygons::geography)',
		d_p2: 'st_distance(a_polygons::geography, b_polygons::geography, true) / st_perimeter(b_polygons::geography)',

		// distance of centroids
		dc: 'st_distance(st_centroid(m.a_polygons)::geography, st_centroid(m.b_polygons)::geography, true)',

		// distance of furthest points
		df: 'st_length(st_longestline(m.a_polygons, m.b_polygons)::geography, true)',
	},
};

let a_metric_selects = [];
let a_metric_types = [];
let h_selects = h_metric.selects;
for(let s_key in h_selects) {
	let z_value = h_selects[s_key];
	if('string' === typeof z_value) {
		a_metric_selects.push(z_value+' as '+s_key);
		a_metric_types.push(s_key+' double precision');
	}
	else {
		a_metric_selects.push(z_value.select+' as '+s_key);
		a_metric_types.push(s_key+' '+z_value.type);
	}
}


async.series([
	(fk_task) => {
		db.query(`drop table ${s_code}`, (e_query) => {
			if(e_query) local.error(e_query);
			fk_task();
		});
	},
	(fk_task) => {
		db.query(`
			create table ${s_code} (
				a_osm_id text,
				b_osm_id text,
				a_dbr_id text,
				b_dbr_id text,
				a_polygons geometry(multipolygon, 4326),
				b_polygons geometry(multipolygon, 4326),
				${a_metric_types.join(', ')}
			);
		`, (e_query) => {
			if(e_query) local.error(e_query);
			fk_task();
		});
	},
	(fk_task) => {
		parallelize(`
			select
				a0.osm_id,
				a0.dbr_id,
				a0.polygons
			from osm_polygons a0
		`, 'a', (s_select) => {
			return `
				with copy_rows as (
					select
						i.a_osm_id,
						i.b_osm_id,
						i.a_dbr_id,
						i.b_dbr_id,
						i.a_polygons,
						i.b_polygons,
						${a_metric_selects.join(', ')}
					from (
						select a.osm_id a_osm_id,
							b.osm_id b_osm_id,
							a.dbr_id a_dbr_id,
							b.dbr_id b_dbr_id,
							a.polygons a_polygons,
							b.polygons b_polygons
						from ${s_select}, osm_polygons b
						where st_distance(a.polygons, b.polygons) < 1
							and st_area(a.polygons) <= st_area(b.polygons)
					) i
					where st_distance(i.a_polygons::geography, i.b_polygons::geography, true) < 30000
						and a_dbr_id NOT LIKE b_dbr_id
						and a_osm_id NOT LIKE b_osm_id
				) insert into ${s_code}
				select * from copy_rows
				`;
		}, (e_query, h_result) => {
			if(e_query) {
				local.fail(e_query);
			}
			local.info('+1 thread closed');
		}, () => {
			local.good('done');
		});
	},
]);
