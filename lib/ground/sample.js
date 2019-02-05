const path = require('path');

const async = require('async');
const request = require('request-promise-native');
const progress = require('progress');
const pg = require('pg');

const graphy = require('graphy');
const {
	core: {
		data: {
			factory: factory,
		},
	},
	content: {
		ttl: {
			read: ttl_read,
		},
	},
	util: {
		dataset: {
			tree: dataset_tree,
		},
	},
} = graphy;

const sparql_results_read = require('@graphy-dev/content.sparql_results.read');

const {
	prefixes: h_prefixes,
	database: g_database,
} = require(path.join(__dirname, '../../config.app.js'));

const N_MAX_QUERIES = 32;
const N_LIMIT = process.argv[2] || Infinity;
const N_LIMIT_RIGHT = process.argv[3] || Infinity;

(async() => {
	// what we're after
	let h_relations = {};

	process.on('SIGINT', () => {
		console.log('\n');

		let a_sorted = Object.entries(h_relations).sort((a_a, a_b) => a_b[1] - a_a[1]);
		console.dir(a_sorted.slice(0, 10));
		
		process.exit(1);
	});

	let a_polygons;
	let a_polylines;
	{
		let y_client = new pg.Client(g_database);
		y_client.connect();
		
		let g_result_pg = await y_client.query(/* syntax: sql */ `
			select a.dbr_id as dbr_id from osm_polygons a
				where (a.is_park = true or a.is_city = true or a.is_county = true);
		`);

		a_polygons = g_result_pg.rows.map(g_row => g_row.dbr_id);
		console.log(`${a_polygons.length} polygons`);

		let g_result_pl = await y_client.query(/* syntax: sql */ `
			select a.dbr_id as dbr_id from osm_polylines a
				where (a.is_road = true or a.is_stream = true);
		`);

		a_polylines = g_result_pl.rows.map(g_row => g_row.dbr_id);
		console.log(`${a_polylines.length} polylines`);

		// do not leak client
		y_client.end();
	}

	// pairwise combos that interact topologically and have cardinal direction relation
	let a_matches = [];

	// combos that do not have a relation in DBpedia
	let a_enhancements = [];

	// places that have a relation in DBpedia but are missing from out dataset
	let a_missing = [];

	let a_avoided = [];

	let y_bar;

	let y_queue = async.queue(async(g_task, fk_task) => {
		let {
			left: si_dbr_left,
			right: si_dbr_right,
		} = g_task;

		let srq_left = `<http://dbpedia.org/resource/${si_dbr_left}>`;
		let srq_right = `<http://dbpedia.org/resource/${si_dbr_right}>`;

		// fetch all cardinal direciton relations involving left place
		let g_body = await request.post('http://dbpedia.org/sparql', {
			json: true,
			form: {
				query: /* syntax: sparql */ `
					select * {
						{
							${srq_left} ?rel ${srq_right} .
						} union {
							${srq_right} ?rel ${srq_left} .
						}
					}
				`,
			},
		});

		let a_rows = g_body.results.bindings;
		if(a_rows.length) {
			// accumulate siblings from sparql resutls
			for(let g_row of a_rows) {
				let yt_rel = factory.from.sparql_result(g_row.rel);
				let sv1_rel = yt_rel.concise();

				h_relations[sv1_rel] = (h_relations[sv1_rel] || 0) + 1;
			}
		}

		y_bar.tick(1);

		fk_task();
	}, N_MAX_QUERIES);


	let n_polygons = a_polygons.length;
	let n_max_left = Math.min(N_LIMIT, n_polygons);
	let n_max_right = Math.min(N_LIMIT_RIGHT, n_polygons);
	let n_places = a_polylines.length + a_polylines.length;

	console.log(`traversing up to ${n_max_left} on left side`);
	for(let i_left=0; i_left<n_max_left; i_left++) {
		for(let i_right=i_left+1; i_right<n_max_right; i_right++) {
			y_queue.push({
				left: a_polygons[i_left],
				right: a_polygons[i_right],
			});
		}
	}

	y_bar = new progress('[:bar] :percent :current/:total; +:elapseds; -:etas', {
		incomplete: ' ',
		complete: '∎', // 'Ξ',
		width: 40,
		total: y_queue.length(),
	});

	console.log(`pushed all tasks: ${y_queue.length()}`);

	y_queue.drain = () => {
		let a_sorted = Object.entries(h_relations).sort((a_a, a_b) => a_b[1] - a_a[1]);
		console.dir(a_sorted.slice(0, 10));
	};
})();
