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
	touches: {
		core: 'pg_disjoint_pg',
		where: 'st_intersects(a_buffer, b_buffer)',
	},
	equals: {
		core: 'pg_overlaps_pg',
		select: `
			a.polygons_valid a_geom,
			b.polygons_valid b_geom,
		`,
		where: 'st_covers(b_buffer::geometry, a_geom) and st_covers(a_buffer::geometry, b_geom)',
	},
	tpp: {
		core: 'pg_overlaps_pg',
		select: `
			a.polygons_valid a_geom,
			b.polygons_valid b_geom,
		`,
		where: /* syntax: sql */ `
			st_covers(b_buffer::geometry, a_geom)
				and st_intersects(st_boundary(a_buffer::geometry), st_boundary(b_geom))
		`,
			// st_intersects(st_boundary(a_buffer::geometry), st_boundary(b_buffer::geometry))
	},
	// crosses: {
	// 	where: 'st_crosses(a.polygons_valid, b.polylines)',
	// },
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
					c.z_id z_id,
					${h_metric.select || ''}
					`+(s_type_a === s_type_b
						? `
							a.id a_id,
							b.id b_id,
							st_buffer(a.polygons_valid::geography, ${f_buffer('a')}) a_buffer,
							st_buffer(b.polygons_valid::geography, ${f_buffer('b')}) b_buffer `
						: `
							case when a.is_${s_type_a} = true
								then c.a_id
							else c.b_id
							end a_id,
							case when b.is_${s_type_b} = true
								then c.b_id
							else c.a_id
							end b_id,
							case when a.is_${s_type_a} = true
								then ${(A_BUFFER_TYPES.includes(s_type_a) || b_force_buffer)? `st_buffer(a.polygons_valid::geography, ${f_buffer('a')})`: 'a.polygons_valid'}
							else ${(A_BUFFER_TYPES.includes(s_type_b) || b_force_buffer)? `st_buffer(a.polygons_valid::geography, ${f_buffer('a')})`: 'a.polygons_valid'}
							end a_buffer,
							case when b.is_${s_type_b} = true
								then ${(A_BUFFER_TYPES.includes(s_type_b) || b_force_buffer)? `st_buffer(b.polygons_valid::geography, ${f_buffer('b')})`: 'b.polygons_valid'}
							else ${(A_BUFFER_TYPES.includes(s_type_a) || b_force_buffer)? `st_buffer(b.polygons_valid::geography, ${f_buffer('b')})`: 'b.polygons_valid'}
							end b_buffer
						`)+`
				from ${h_metric.core} c
				left join osm_polygons a
					on c.a_id = a.id
				left join osm_polygons b
					on c.b_id = b.id
				where `+(s_type_a === s_type_b
					? `a.is_${s_type_a} = true and b.is_${s_type_b} = true`
					: `(
						(
							a.is_${s_type_a} = true
							and b.is_${s_type_b} = true
						) or
						(
							a.is_${s_type_b} = true
							and b.is_${s_type_a} = true
						)
					)`)+`
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
