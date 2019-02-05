// native
const fs = require('fs');
const path = require('path');

// third-party modules
const async = require('async');
const pg = require('pg');
const os = require('os');

const local = require('classer').logger('pj');

// local classes

/**
* config:
**/

pg.defaults.poolSize = os.cpus().length;


/**
* static:
**/

// connection string regex parser
// const R_CONNECT = /^\s*(?:(?:(?:(\w+):\/\/)?(\w+)(?::([^@]+))?@)?(\w+)?\/)?(\w+)(\?.+)\s*$/;
const R_CONNECT = /^\s*([\w\-]+)?(:[^@]+)?@([^:\/?\s]+)?(:\d+)?\/([^?\s]+)\s*/;

//
const R_SLASH_LITERAL = /^([^/]*)\/(.*)\/([^/]*)$/;


// escape string literal
const escape_literal = (s_value) => {
	return s_value
		.replace(/'/g, '\'\'')
		.replace(/\t/g, '\\t')
		.replace(/\n/g, '\\n');
};


// convert pj string into value
const pj_string = (s_value) => {
	return `'${escape_literal(s_value)}'`;
};

//
const valuify = (z_value) => {
	switch(typeof z_value) {
		case 'string':
			return pj_string(z_value);

		case 'number':
			return z_value;

		case 'boolean':
			return z_value? 'TRUE': 'FALSE';

		case 'object':
			// null
			if(null === z_value) {
				return null;
			}
			// array
			else if(Array.isArray(z_value)) {
				return 'ARRAY['+z_value.map(valuify).join(',')+']';
			}
			// raw sql
			else if('string' === typeof z_value.raw) {
				return z_value.raw;
			}

			// default
			return escape_literal(
				JSON.stringify(z_value)
			);

		case 'function':
			return z_value()+'';

		default:
			throw `unable to convert into safe value: "${z_value}"`;
	}
};

// 
const H_WRITERS = {

	// convert hash query to string query
	insert(h_query) {

		// ref insert list
		let a_inserts = h_query.insert;

		// prep list of rows that have been observed from first element
		let a_keys = Object.keys(a_inserts[0]);

		// build columns part of sql string
		let s_keys = a_keys.map(s_key => `"${s_key}"`).join(',');

		// build values part of sql string
		let a_rows = [];

		// each insert row
		a_inserts.forEach((h_row) => {

			// list of values to insert for this row
			let a_values = [];

			// each key-value pair in row
			for(let s_key in h_row) {

				// key is missing from accepted values section
				if(-1 === a_keys.indexOf(s_key)) {
					return local.fail('new key "${s_key}" introduced after first element in insert chain');
				}

				// append to values
				a_values.push(valuify(h_row[s_key]));
			}

			// push row to values list
			a_rows.push(`(${a_values.join(',')})`);
		});

		//
		let s_tail = '';

		//
		if(h_query.conflict_target && h_query.conflict_action) {
			s_tail += `on conflict ${h_query.conflict_target} ${h_query.conflict_action}`;
		}

		// prep sql query string
		return `insert into "${h_query.into}" (${s_keys}) values ${a_rows.join(',')} ${s_tail}`;
	},

	//
	select(h_query) {
		let {
			select: a_select,
			from: s_from,
			where: a_where,
		} = h_query;

		// construct sql query string
		return `select ${a_select.length? a_select.join(','): '*'} from ${s_from} ${a_where.length? 'where '+a_where.join(' and '): ''}`;
	},
};



/**
* class:
**/
module.exports = function(w_config) {

	// initiate connection poool
	let y_pool = new pg.Pool(w_config);

	// query-building for insertion
	const qb_insert = (h_query) => {
		// default insert hash
		h_query.insert = h_query.insert || [];

		//
		const chain = {

			// insert rows
			insert(z_values) {

				// list of rows to insert simultaneously
				if(Array.isArray(z_values)) {

					// append to existing insertion list
					h_query.insert.push(...z_values);
				}
				// values hash
				else if('object' === typeof z_values) {

					// single row to append to insertion list
					h_query.insert.push(z_values);
				}
				// other type
				else {
					local.fail('invalid type for insertion argument');
				}

				// normal insert actions
				return chain;
			},

			// on conflict
			on_conflict: Object.assign((s_target) => {

				// set conflict target
				h_query.conflict_target = `(${s_target})`;

				// next action hash
				return {

					// do nothing
					do_nothing() {

						// set conflict action
						h_query.conflict_action = 'do nothing';

						// normal insert actions
						return chain;
					},

					// upsert
					do_update(h_update) {

						// each update set
						let s_upsert = Object.keys(h_update).map((s_key) => {
							return `${s_key}=${valuify(h_update[s_key])}`;
						}).join(',');

						// set conflict action
						h_query.conflict_action = `do update set ${s_upsert}`;

						// normal insert actions
						return chain;
					},
				};
			}, {

				// on constraint
				on_constraint(s_target) {

					// set conflict target
					h_query.conflict_target = `on constraint ${s_target}`;

					//
					return {

						// do nothing
						do_nothing() {

							// set conflict action
							h_query.conflict_action = 'do nothing';

							// normal insert actions
							return chain;
						},

						// upsert
						do_update(h_update) {

							// each update set
							let s_upsert = Object.keys(h_update).map((s_key) => {
								return `${s_key}=${valuify(h_update[s_key])}`;
							}).join(',');

							// set conflict action
							h_query.conflict_action = `do update set ${s_upsert}`;

							// normal insert actions
							return chain;
						},
					};
				},
			}),

			//
			debug() {

				// generate sql
				let s_sql = H_WRITERS.insert(h_query);

				debugger;
				return chain;
			},

			//
			exec(f_okay) {
				// generate sql
				let s_sql = H_WRITERS.insert(h_query);

				// submit
				self.query(s_sql, (e_insert, w_result) => {
					// insert error
					if(e_insert) {
						debugger;
						if(/geometry requires more points/.test(e_insert)) {
							local.warn('failed to insert geometry because it "requires more points"... >_>');
						}
						else {
							local.fail(`${s_sql}\n${e_insert}`);
						}
					}

					//
					if('function' === typeof f_okay) {
						f_okay(w_result);
					}
				});
			},
		};

		//
		return chain;
	};

	// query-building for selection
	const qb_select = (h_query) => {

		// default insert hash
		h_query.select = h_query.select || [];
		h_query.where = h_query.where || [];

		//
		const select_expr = (z_field) => {

			// field is string
			if('string' === typeof z_field) {

				// push to selections
				h_query.select.push(z_field);
			}
			// other type
			else {
				local.fail('invalid type for selection argument');
			}
		};

		//
		const chain = {

			// select columns
			select(...a_fields) {

				//
				a_fields.forEach(select_expr);

				// normal insert actions
				return chain;
			},

			// where
			where(z_where) {

				// hash
				if('object' === typeof z_where) {

					//
					for(let s_key in z_where) {

						// ref value of where clause
						let z_value = z_where[s_key];

						// append to where block
						h_query.where.push(`"${s_key}"='${valuify(z_value)}'`);
					}
				}
				else if('string' === typeof z_where) {
					h_query.where.push(z_where);
				}
				// other type
				else {
					local.fail('invalid type for where argument');
				}

				return chain;
			},

			//
			debug() {

				// generate sql
				let s_sql = H_WRITERS.select(h_query);

				debugger;
				return chain;
			},

			each(fk_each, fk_done) {
				// generate sql
				let s_sql = H_WRITERS.select(h_query);

				// submit
				self.query_event(s_sql, (k_query, fk_client) => {
					k_query.on('row', (h_row) => {
						fk_each(h_row);
					});

					k_query.on('error', (e_query) => {
						local.fail(e_query+' from: \n'+s_sql);
					});

					k_query.on('end', () => {
						fk_client();
						fk_done(y_pool);
					});
				});
			},

			//
			exec(f_okay) {

				// generate sql
				let s_sql = H_WRITERS.select(h_query);
				console.log(s_sql);

				// submit
				self.query(s_sql, (e_insert, w_result) => {

					// insert error
					if(e_insert) {
						local.fail(e_insert+' from: \n'+s_sql);
					}

					//
					if('function' === typeof f_okay) {
						f_okay(w_result.rows);
					}
				});
			},
		};

		//
		return chain;
	};

	//
	const self = {

		// start of an insert query
		into(s_table) {
			return qb_insert({
				into: s_table,
			});
		},


		// start of a selcet query
		from(s_table) {
			return qb_select({
				from: s_table,
			});
		},


		//
		query(s_sql, fk_query) {

			// grab client from the pool
			y_pool.connect((e_connect, y_client, fk_client) => {
				if(e_connect) local.fail(e_connect);

				// execute query
				y_client.query(s_sql, (e_query, w_result) => {
					// release client back to pool
					fk_client();

					// forward to callback
					fk_query(e_query, w_result, s_sql);
				});
			});
		},


		//
		query_event(s_sql, fk_query) {

			// grab client from the pool
			y_pool.connect((e_connect, y_client, fk_client) => {
				if(e_connect) local.fail(e_connect);

				// execute query
				fk_query(y_client.query(s_sql), fk_client);
			});
		},


		//
		series(a_queries, f_okay) {

			// each query in input list
			async.mapSeries(a_queries, (s_query, f_next_query) => {

				// query the database connection
				self.query(s_query, (e_query, h_result) => {

					// there was an error
					if(e_query) {
						// report error
						return f_next_query(e_query);
					}
					// no errors!
					else {
						// continue
						f_next_query(null, h_result);
					}
				});
			}, f_okay || (() => {}));
		},

		//
		escape: valuify,

		end() {
			y_pool.end();
		},
	};

	return self;
};

