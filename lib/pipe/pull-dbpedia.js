
const async = require('async');
const pg = require('pg');
const spaz = require('spaz');

const $$ = spaz({
	engine: {
		// endpoint: 'http://stko-lod.geog.ucsb.edu:8890/sparql',
		endpoint: 'http://localhost:8890/sparql',
		http_methods: 'post',
	},
	prefixes: {
		dbr: 'http://dbpedia.org/resource/',
		dbo: 'http://dbpedia.org/ontology/',
		dbp: 'http://dbpedia.org/property/',
		geo: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
	},
});

// const pj = require('../util/pj');
const h_pg_config = require('../../database');

// const db = pj(h_pg_config);

const local = require('classer').logger('pull-dbpedia');

const P_IRI_DBR = 'http://dbpedia.org/resource/';

const N_MAX_SPARQL_VALUES = 1;
const N_MAX_SPARQL_QUERIES = 12;

let h_types = {
	'': 0,
};

process.on('SIGINT', () => {
	for(let s_type in h_types) {
		console.log(h_types[s_type]+'\t'+s_type.substr('http://dbpedia.org/ontology/'.length)); 
	}
	process.exit(0);
});

let c_counties = 0;

let y_pool = new pg.Pool(h_pg_config);
y_pool.connect((e_connect, y_client, fk_client) => {
	if(e_connect) local.fail(e_connect);

	y_client.query('select * from osm_polygons', (e_query, h_result) => {
		if(e_query) local.fail(e_query);

		let a_rows = h_result.rows;
		// let n_rows = a_rows.length;
		// for(let i_group=0; i_group<n_rows; i_group+=N_MAX_SPARQL_VALUES) {
		// 	let a_values = [];
		// 	let a_values_h = [];

		// 	for(let i_row=i_group; i_row<i_group+N_MAX_SPARQL_VALUES && i_row<n_rows; i_row++) {
		// 		let h_row = a_rows[i_row];
		// 		a_values.push(`(<${P_IRI_DBR+h_row.dbr_id}> "${h_row.osm_id}")`);

		// 		a_values_h.push({
		// 			dbr: `<${P_IRI_DBR+h_row.dbr_id}>`,
		// 			osm: `"h_row.osm_id}"`,
		// 		});
		// 	}

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
				// .where(`
				// 	?dbr a ?type .
				// 	filter not exists {
				// 		?type ^rdfs:subClassOf ?otherType .
				// 		?dbr a ?otherType .
				// 	}
				// 	filter(strstarts(str(?type), "http://dbpedia.org/ontology/"))
				// `) //.replace('?dbr', `<${P_IRI_DBR+h_row.dbr_id}>`))
				.where(
					// `?dbr dbo:type <http://dbpedia.org/resource/County_(United_States)>`
					/* syntax: sparql.where */ `
						{
							?dbr a <http://dbpedia.org/class/yago/County108546183> .
						} union {
							?city dbo:county ?dbr .
						} union {
							?dbr dbo:type <http://dbpedia.org/resource/County_(United_States)> .
						}
					`
				)
				.values(a_values)
				.rows((a_bindings) => {

					// a_bindings.map((h_binding) => {
					// 	local.info(h_binding.dbr.value+' => '+h_binding.type.value);

					// 	return h_binding.type.value;
					// }).filter((s_type) => {
					// 	if('http://dbpedia.org/ontology/Location' === s_type) return false;

					// 	if(!h_types[s_type]) h_types[s_type] = 1;
					// 	else h_types[s_type] += 1;
					// 	// console.log(s_type);

					// 	return true;
					// });

					if(!a_bindings.length) {
						h_types[''] += 1;
						// local.warn('no dbo type for '+a_items.map(h => h.dbr_id).join(' / '));
					}
					else {
						local.good(a_bindings[0].dbr.value+' is a county');
						y_client.query(`update osm_polygons set is_county = true where osm_id = '${a_items[0].osm_id}'`, (e_update) => {
							if(e_update) local.fail(e_update);
						});
					}

					fk_row();
				});
		}, () => {
			local.good(c_counties+' counties');
			fk_client();

			for(let s_type in h_types) {
				console.log(h_types[s_type]+'\t'+s_type.substr('http://dbpedia.org/ontology/'.length)); 
			}
		});
	});
});
