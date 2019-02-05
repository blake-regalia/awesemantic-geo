const pg = require('pg');
const graphy = require('graphy');
const request = require('request-promise-native');
const progress = require('progress');
const g_config = require('../../config.app.js');

let y_client = new pg.Client(g_config.database);

y_client.connect();

(async() => {
	let s_query = /* syntax: sql */ `
		select a.dbr_id a_dbr, b.dbr_id b_dbr
			from pg_tpp_pg c
			left join osm_polygons a
				on c.a_id = a.id
			left join osm_polygons b
				on c.b_id = b.id
			where a.is_city = true
				and b.is_city = true
	`;

	let g_res = await y_client.query(s_query);

	let as_places = new Set();
	for(let g_row of g_res.rows) {
		as_places.add(g_row.a_dbr);
		as_places.add(g_row.b_dbr);
	}

	let y_bar = new progress('[:bar] :percent :current/:total; +:elapseds; -:etas', {
		incomplete: ' ',
		complete: '∎', // 'Ξ',
		width: 40,
		total: as_places.size,
	});

	let h_types = {};
	for(let s_place of as_places) {
		let p_dbr = `http://dbpedia.org/resource/${s_place}`;

		let srq_query = /* syntax: sparql */ `
			select ?type {
				<${p_dbr}> rdf:type ?type .
			}
		`;

		let g_res_types = await request.post('http://dbpedia.org/sparql', {
			json: true,
			form: {
				query: srq_query,
			},
		});

		let a_types = g_res_types.results.bindings.map(g => graphy.from.sparql_result(g.type));
		for(let kt_type of a_types) {
			let sv1_type = kt_type.concise();
			h_types[sv1_type] = (h_types[sv1_type] || 0) + 1;
		}

		y_bar.tick(1);
	}

	console.log('\n');

	const h_prefixes = {
		dbr: 'http://dbpedia.org/resource/',
		dbo: 'http://dbpedia.org/ontology/',
		yago: 'http://dbpedia.org/class/yago/',
		wikidata: 'http://www.wikidata.org/entity/',
		'umbel-rc': 'http://umbel.org/umbel/rc/',
		schema: 'http://schema.org/',
		w3geo: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
	};

	let h_types_sorted = Object.entries(h_types).sort((a_a, a_b) => a_b[1] - a_a[1])
		.reduce((h_out, [sv1_type, n_instances]) => ({
			...h_out,
			[graphy.c1(sv1_type).concise(h_prefixes)]: n_instances,
		}), {});

	console.log(JSON.stringify(h_types_sorted, null, '\t'));

	y_client.end();

})();
