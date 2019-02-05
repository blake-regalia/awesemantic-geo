
const async = require('async');
const pg = require('pg');
const spaz = require('spaz').default;

const $$ = spaz({
	engine: {
		// endpoint: 'http://stko-lod.geog.ucsb.edu:8890/sparql',
		// endpoint: 'http://localhost:8890/sparql',
		endpoint: 'http://dbpedia.org/sparql',
		http_methods: 'post',
	},
	prefixes: {
		dbr: 'http://dbpedia.org/resource/',
		dbo: 'http://dbpedia.org/ontology/',
		dbp: 'http://dbpedia.org/property/',
		geo: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
		yago: 'http://dbpedia.org/class/yago/',
	},
});

const h_pg_config = require('../../database');

const local = require('classer').logger('dbpedia');

const P_IRI_DBR = 'http://dbpedia.org/resource/';

const N_MAX_SPARQL_VALUES = 1;
const N_MAX_SPARQL_QUERIES = 12;

module.exports = {
	test(s_table, s_where, fe_query, fk_table) {
		let y_pool = new pg.Pool(h_pg_config);
		y_pool.connect((e_connect, y_client, fk_client) => {
			if(e_connect) local.fail(e_connect);

			y_client.query(`select * from ${s_table}`, (e_query, h_result) => {
				if(e_query) local.fail(e_query);

				let a_rows = h_result.rows;

				let a_chunks = [];
				for(let i_chunk=0; i_chunk<a_rows.length; i_chunk+=N_MAX_SPARQL_VALUES) {
					a_chunks.push(a_rows.slice(i_chunk, i_chunk+N_MAX_SPARQL_VALUES));
				}

				async.eachLimit(a_chunks, N_MAX_SPARQL_QUERIES, (a_items, fk_row) => {
					let a_values = a_items.map((h_item) => {
						return {
							dbr: `<${P_IRI_DBR+h_item.dbr_id.replace(/"/g, '%22')}>`,
						};
					});

					$$.select('?dbr')
						.where(s_where)
						.values(a_values)
						.rows((a_bindings) => {
							fe_query(a_items, a_bindings, y_client, fk_row);
						});
				}, () => {
					// user script callback
					fk_table();
				});
			});
		});
	},
};
