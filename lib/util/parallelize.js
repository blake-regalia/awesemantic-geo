const os = require('os');

const async = require('async');
const pj = require('../util/pj');

const h_pg_config = require('../../database');
const local = require('classer').logger('parallelize');

module.exports = function(h_config, f_each, fk_done) {
	const db = pj(h_pg_config);
	db.from(h_config.count).select('count(*) as count')
		.exec((a_rows) => {
			let n_count = parseInt(a_rows[0].count);
			let n_chunk = h_config.rows;

			h_config.start && h_config.start(n_count);

			let n_cores = os.cpus().length;
			let k_queue = async.queue((s_sql, fk_query) => {
// local.info(s_sql);
// process.exit(1);
				let x_start = process.uptime();
				db.query(s_sql, (e_query, h_result) => {
					if(e_query) e_query.message += `\nquery:\n${s_sql}`;
					let x_stop = process.uptime() - x_start;
					f_each(e_query, h_result, x_stop, s_sql);
					fk_query();
				});
			}, n_cores);

			k_queue.drain = () => {
				db.end();
				fk_done();
			};

			if(h_config.debug) {
				local.info(h_config.gen(`(
					${h_config.inner}
					${h_config.order? `order by ${h_config.order} asc`: ''}
					limit ${n_chunk} offset $OFFSET
				)`));
			}
			let c_offset = 0;
			while(c_offset < n_count) {
				k_queue.push(h_config.gen(`(
					${h_config.inner}
					${h_config.order? `order by ${h_config.order} asc`: ''}
					limit ${n_chunk} offset ${c_offset}
				)`));
				c_offset += n_chunk;
			}
		});
};
