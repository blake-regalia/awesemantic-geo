const pg = require('pg');

const config = require('../../config.app.js');
const spaz = require('spaz').default;
const $$ = spaz({
	engine: {
		endpoint: 'http://localhost:8890/sparql',
		http_methods: 'post',
	},
	prefixes: config.prefixes,
});

let y_pool = new pg.Pool(config.database);


const S_TABLE = process.argv[2] || 'osm_polygons';
const X_CHUNK_SIZE = process.argv[3] || 50;

y_pool.query(/* syntax: sql */ `
	select id, osm_id, wkd_id from ${S_TABLE} where dbr_id is null and wkd_id is not null;
`, (e_query, y_res) => {
	let a_rows = y_res.rows;

	let a_chunks = [];
	while(a_rows.length > X_CHUNK_SIZE) {
		a_chunks.push(a_rows.slice(0, X_CHUNK_SIZE));
		a_rows = a_rows.slice(X_CHUNK_SIZE);
	}

	for(let a_subrows of a_chunks) {
		$$.select('*')
			.where(`
				?dbr owl:sameAs ?wkd_id .
				values ?wkd_id {
				 	${a_subrows.map(g_row => `wkd:${g_row.wkd_id}`).join(' ')}
				}
			`)
			.rows((a_bindings) => {
				console.log(`${a_bindings.length} rows`)
				for(let g_row of a_bindings) {
					let si_dbr = g_row.dbr.value.slice('http://dbpedia.org/resource/'.length);
					let si_wkd = g_row.wkd_id.value.slice('http://www.wikidata.org/entity/'.length);

					y_pool.query(/* syntax: sql */ `
						update ${S_TABLE} set dbr_id = $1 where wkd_id = $2
					`, [
						si_dbr,
						si_wkd,
					], (e_update) => {
						if(e_update) console.error(e_update);
						else console.log(`${si_dbr} => ${si_wkd}`);
					});
				}
			});
	}
});
