const async = require('async');

const pj = require('../util/pj');
const h_pg_config = require('../../database');
const db = pj(h_pg_config);
const progress = require('progress');

const parallelize = require('../util/parallelize');

module.exports = function(s_code, h_metric, f_par) {
	const local = require('classer').logger(s_code);

	let a_metric_selects = [];
	let a_metric_types = [];
	let a_metric_fields = [];
	let h_selects = h_metric.selects;
	for(let s_key in h_selects) {
		a_metric_fields.push(s_key);
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

	const N_LIMIT = 16;

	let bar;
	let c_inserts = 0;
	let c_queries = 0;
	let x_total_time = 0;
	async.series([
		(fk_task) => {
			db.query(`drop table ${s_code}`, (e_query) => {
				if(e_query) local.warn(`while trying to drop table: ${e_query}`);
				fk_task();
			});
		},
		(fk_task) => {
			db.query(`
				create table ${s_code} (
					id uuid primary key default gen_random_uuid(),
					a_id int,
					b_id int
					${a_metric_types.map(s => ', '+s).join('')}
				);
			`, (e_query) => {
				if(e_query) local.error('create: '+e_query);
				fk_task();
			});
		},
		(fk_task) => {
			parallelize(Object.assign(f_par(a_metric_selects, N_LIMIT, a_metric_fields), {
				start(n_rows) {
					bar = new progress('[:bar] :percent :current/:total; +:elapseds; -:etas (:inserts inserts; @:averages / query)', {
						incomplete: ' ',
						complete: '∎', // 'Ξ',
						width: 40,
						total: n_rows,
					});

					bar.tick(0, {
						inserts: 0,
						average: 0,
					});
				},
			}), (e_query, h_result, x_time, s_sql) => {
				c_queries += 1;
				x_total_time += x_time;
				if(e_query) {
					local.warn(s_sql);
					local.fail('query: '+e_query);
				}
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
};
