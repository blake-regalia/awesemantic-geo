const pg = require('pg');
const wkt = require('terraformer-wkt-parser');

const config = require('../../config.app.js');
const spaz = require('spaz').default;
const $$ = spaz({
	engine: {
		// endpoint: 'http://localhost:8890/sparql',
		endpoint: 'http://dbpedia.org/sparql',
		http_methods: 'post',
	},
	prefixes: config.prefixes,
});

let y_pool = new pg.Pool(config.database);


const S_TABLE = process.argv[2] || 'osm_polygons';
let s_limit = process.argv[3] || '';

y_pool.query(/* syntax: sql */ `
	select id, dbr_id from ${S_TABLE} where points is null and dbr_tried = false ${s_limit? `limit ${s_limit}`: ''};
`, (e_query, y_res) => {
	let a_rows = y_res.rows;

	for(let g_row of a_rows) {
		$$.select('*')
			.where(`
				<http://dbpedia.org/resource/${g_row.dbr_id.replace(/"/g, '%22')}> geo:geometry ?wkt .
			`)
			.rows((a_bindings) => {
				console.log(`${g_row.dbr_id} has ${a_bindings.length} point geometry(ies)`);

				let a_crds = [];
				for(let g_res of a_bindings) {
					let g_point = wkt.parse(g_res.wkt.value);
					a_crds.push(g_point.coordinates);
				}

				if(a_crds.length) {
					let s_multipoint = wkt.convert({
						type: 'MultiPoint',
						coordinates: a_crds,
					});

					console.info(`injecting multipoint into ${g_row.dbr_id}`);

					y_pool.query(/* syntax: sql */ `
						update ${S_TABLE} set points = ST_GeomFromText($1, 4326) where id = $2
					`, [
						s_multipoint,
						g_row.id,
					], (e_update) => {
						if(e_update) console.error(e_update);
						else console.log(`${g_row.dbr_id} << ${s_multipoint}`);
					});
				}
				else {
					y_pool.query(/* syntax: sql */ `
						update ${S_TABLE} set dbr_tried = true
					`, (e_update) => {});
				}
			});
	}
});
