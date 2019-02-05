const async = require('async');
const pj = require('../util/pj');
const h_pg_config = require('../../database');
const db = pj(h_pg_config);

const progress = require('progress');

let s_type_a = process.argv[2];
let s_relation = process.argv[3];
let s_type_b = process.argv[4];
let x_multiplier = parseFloat(process.argv[5]);

let f_buffer = (s_table) => {
	return `${x_multiplier} * (4 * pi() * st_area(${s_table}.polygons::geography)) / (st_perimeter(${s_table}.polygons::geography) ^ 2)`;
};

const H_METRICS = {
	touches: {
		where: 'st_intersects(a_buffer, b_buffer)',
	},
};

let h_metric = H_METRICS[s_relation];

const local = require('classer').logger(s_relation);
const parallelize = require('../util/parallelize');

let s_code = `${s_type_a}_broad_${s_relation}_${s_type_b}`;

const A_BUFFER_TYPES = [
	// 'park', 'city', 'county',
];

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
				b_id int
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
					a0.id,
					a0.buffer_radius,

					case when a0.polylines_sewn is not null
						then st_simplify(a0.polylines_sewn, 10, true)
						else st_simplify(a0.polylines, 10, true)
					end as polylines

				from osm_polylines a0
				where a0.is_${s_type_a} = true
				${''/*
					and (a0.id) in (select a_id from pl_disjoint_pg)
				*/}
			`,
			rows: N_LIMIT,
			gen: (s_select) => `
				with copy_rows as (
					select
						y_id,
						a_id,
						b_id
					from (
						select
							gen_random_uuid() y_id,
								a.id a_id,
								b.id b_id,
								a.buffer a_buffer,

								${
									A_BUFFER_TYPES.includes(s_type_b)
										? `st_buffer(b.polygons::geography, ${f_buffer('b')}, '${S_BUFFER_STYLE}') b_buffer`
										: 'b.polygons::geography b_buffer'
								}

						from (
							select
								a1.id,
								d.b_id,
								st_buffer(a1.polylines::geography, a1.buffer_radius, '${S_BUFFER_STYLE}') buffer

							from (
								${s_select}
							) a1

							inner join pl_disjoint_pg d on d.a_id = a1.id
						) a

						left join osm_polygons b on b.id = a.b_id
						where (
							b.is_${s_type_b} = true
						)
						${''/*and (a.id, b.id) in (
							select a_id, b_id
							from pl_disjoint_pg
						)*/}
					) i
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
