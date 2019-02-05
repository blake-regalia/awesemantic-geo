const async = require('async');
const pj = require('../util/pj');
const h_pg_config = require('../../database');
const db = pj(h_pg_config);

const progress = require('progress');

let s_type_a = process.argv[2];
let s_relation = process.argv[3];
let s_type_b = process.argv[4];

const H_METRICS = {
	touches: {
		// where: 'st_intersects(a_buffer, b_buffer)',
		where: 'aib > 0',
		// where: 'aib > 0',
	},
};

let h_metric = H_METRICS[s_relation];

const local = require('classer').logger(s_relation);
const parallelize = require('../util/parallelize');

let s_code = `${s_type_a}_broad_${s_relation}_${s_type_b}`;

const S_BUFFER_STYLE = 'quad_segs=2 endcap=square join=mitre';

const N_LIMIT = 12;

let bar;
let c_inserts = 0;
let c_queries = 0;
let x_total_time = 0;
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
				y_id uuid,
				a_id int,
				b_id int,
				aib double precision
			);
		`, (e_query) => {
			if(e_query) local.error(e_query);
			fk_task();
		});
	},
	(fk_task) => {
		parallelize({
			count: 'osm_polylines',
			order: `id`,
			inner: `
				select
					a0.buffer_radius ra,
					a0.is_${s_type_a} a_is_${s_type_a},
					${s_type_a !== s_type_b? `a0.is_${s_type_b} a_is_${s_type_b},`: ''}
					a0.id a_id,
					a0.polylines_buffered a_buffer
				from osm_polylines a0
				where a0.id in (select a_id from pl_disjoint_pl_dirty)
					and (
						a0.is_${s_type_a} = true
						${s_type_a !== s_type_b? `or a0.is_${s_type_b} = true`: ''}
					)
			`,
			rows: N_LIMIT,
			gen: (s_select) => `
				with copy_rows as (
					select
						y_id,
						a_id,
						b_id,
						aib

					from (
						select *,
							st_area(st_intersection(a_buffer, b_buffer)::geography) aib

						from (
							select
								y_id,
								a_id,
								b_id,
								a_buffer,
								b.polylines_buffered b_buffer

							from (
								select
									a1.*,
									c.id y_id,
									c.b_id,
									c.d

								from (
									${s_select}
								) a1
								inner join pl_disjoint_pl_dirty c
									on a1.a_id = c.a_id
							) i
							left join osm_polylines b
								on b.id = i.b_id

							where (
								(
									i.a_is_${s_type_a} = true
									and b.is_${s_type_b} = true
								) or (
									i.a_is_${s_type_b} = true
									and b.is_${s_type_a} = true
								)
							) and st_intersects(a_buffer, b.polylines_buffered)
						) j
					) z
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
