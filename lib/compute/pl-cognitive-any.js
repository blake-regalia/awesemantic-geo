const async = require('async');
const pj = require('../util/pj');
const h_pg_config = require('../../database');
const db = pj(h_pg_config);

const progress = require('progress');

let s_type_a = process.argv[2];
let s_relation = process.argv[3];
let s_type_b = process.argv[4];
let x_multiplier = parseFloat(process.argv[5]);
let b_force_buffer = !!process.argv[6];

let f_buffer = (s_table) => {
	return `${x_multiplier} * (4 * pi() * st_area(${s_table}.polygons_valid::geography)) / (st_perimeter(${s_table}.polygons_valid::geography) ^ 2)`;
};

const H_METRICS = {
	runsAlong: {
		core: 'pg_disjoint_pg',
		where: 'st_area(st_intersection(a_buffer, b_buffer)) > 400',
	},
};

let h_metric = H_METRICS[s_relation];

const local = require('classer').logger(s_relation);
const parallelize = require('../util/parallelize');

let s_code = `${s_type_a}_broad_${s_relation}_${s_type_b}`;

let A_BUFFER_TYPES = [
	'city', 'park', 'stream'
];


const N_LIMIT = 12;

let bar;
let c_inserts = 0;
let c_queries = 0;
let x_total_time = 0;
async.series([
	(fk_task) => {
		db.query(`drop table ${s_code}`, (e_query) => {
			if(e_query) local.warn(e_query);
			fk_task();
		});
	},
	(fk_task) => {
		db.query(`
			create table ${s_code} (
				z_id uuid,
				a_id int,
				b_id int
			);
		`, (e_query) => {
			if(e_query) local.error(e_query);
			fk_task();
		});
	},
	(fk_task) => {
		parallelize({
			count: h_metric.core,
			order: `c.z_id`,
			inner: `
				select
					c.z_id y_id,
						a.id a_id,
						b.id b_id,
						st_buffer(
							a.polylines::geography,
							ln(2 * st_length(
								st_longestLine(st_centroid(a.polylines), a.polylines)::geography
							))
						) a_buffer,
						st_buffer(b.polygons::geography, ${f_buffer('b')}) b_buffer
				from (
					select * from pl_touches_pg
					union select stream_broad_touches_park
					union select stream_broad_touches_city
					union select stream_broad_touches_county
				) c
				left join osm_polylines a
					on c.a_id = a.id
				left join osm_polygons b
					on c.b_id = b.id
				where b.is_${s_type_b} = true
			`,
			rows: N_LIMIT,
			gen: (s_select) => `
				with copy_rows as (
					select
						z_id,
						a_id,
						b_id
					from ${s_select} i
					where ${h_metric.where}
				) insert into ${s_code}
				select * from copy_rows
			`,
			start(n_rows) {
				bar = new progress('[:bar] :percent :current/:total; +:elapseds; -:etas (:inserts inserts; @:averages / query)', {
					incomplete: ' ',
					complete: '∎', // 'Ξ',
					width: 40,
					total: n_rows,
				});
			},
		}, (e_query, h_result, x_time) => {
			c_queries += 1;
			x_total_time += x_time;
			if(e_query) local.fail(e_query);
			c_inserts += h_result.rowCount;
			bar.tick(N_LIMIT, {
				inserts: c_inserts,
				average: (x_total_time / c_queries).toFixed(2),
			});
		}, () => {
			local.good('done');
			fk_task();
		});
	},
]);
