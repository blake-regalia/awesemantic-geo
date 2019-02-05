const async = require('async');
const fs = require('fs');
const path = require('path');

const pj = require('../util/pj');
const h_pg_config = require('../../database');
const db = pj(h_pg_config);

const mkdirp = require('mkdirp');

let s_type_a = process.argv[2];
let s_relation = process.argv[3];
let s_type_b = process.argv[4];

const H_METRICS = {
	touches: {
		where: 'st_touches(a.polygons, b.polygons)',
		selects: {
			intersection_length: 'st_length(st_intersection(a.polygons, b.polygons)::geography)',
			rll_smaller: 'st_length(st_intersection(a.polygons, b.polygons)::geography) / st_perimeter(a.polygons::geography)',
			rll_bigger: 'st_length(st_intersection(a.polygons, b.polygons)::geography) / st_perimeter(b.polygons::geography)',
			rla_smaller: 'st_length(st_intersection(a.polygons, b.polygons)::geography) / st_area(a.polygons::geography)',
			rla_bigger: 'st_length(st_intersection(a.polygons, b.polygons)::geography) / st_area(b.polygons::geography)',
		},
	},
	overlaps: {
		where: 'st_overlaps(a.polygons, b.polygons)',
		selects: {
			intersection_area: 'st_area(st_intersection(a.polygons, b.polygons)::geography)',
			ap1: 'st_area(st_intersection(a.polygons, b.polygons)::geography) / st_area(a.polygons)',
			ap2: 'st_area(st_intersection(a.polygons, b.polygons)::geography) / st_area(b.polygons)',
		},
	},
	within: {
		where: 'st_within(a.polygons, b.polygons)',
		selects: {
			area_ratio: 'st_area(a.polygons::geography) / st_area(b.polygons::geography)',
		},
	},
};

let h_metric = H_METRICS[s_relation];

const local = require('classer').logger(s_relation);
const parallelize = require('../util/parallelize');

let s_code = `${s_type_a}_${s_relation}_${s_type_b}`;

let p_output = path.join(__dirname, `/../../data/selects/${s_code}.csv`);

let a_metric_selects = [];
let a_metric_types = [];
let h_selects = h_metric.selects;
for(let s_key in h_selects) {
	let z_value = h_selects[s_key];
	if('string' === typeof z_value) {
		a_metric_selects.push(z_value);
		a_metric_types.push(s_key+' double precision');
	}
	else {
		a_metric_selects.push(z_value.select);
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
			where a0.is_${s_type_a} = true
			and st_isvalid(a0.polygons)
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
						${a_metric_selects.join(', ')}
					from ${s_select},
						osm_polygons b
					where ${h_metric.where}
						and a.dbr_id NOT LIKE b.dbr_id
						and a.osm_id NOT LIKE b.osm_id
						and st_isvalid(b.polygons)
						and b.is_${s_type_b} = true
						${s_type_a === s_type_b? 'and st_area(a.polygons) <= st_area(b.polygons)': ''}
				) insert into ${s_code}
				select * from copy_rows
				`;
		}, (e_query, h_result) => {
			if(e_query) local.error(e_query);
			local.info(`+1 thread closed`);
		}, () => {
			local.good('done');
			fk_task();
		});
	},
]);
