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

(async() => {
	let h_counts = {};

	let k_tree = await process.stdin
		.pipe(ttl_read())
		.pipe(dataset_tree())
		.until('finish', true);

	let as_places = new Set();
	let h_combos = {};
	for(let sv1_subject of k_tree.c1_subjects('*')) {
		as_places.add(sv1_subject);

		let yt_subject = factory.c1(sv1_subject);

		for(let sv1_predicate of k_tree.c1_predicates('*', sv1_subject)) {
			for(let sv1_object of k_tree.c1_objects('*', sv1_subject, sv1_predicate)) {
				as_places.add(sv1_object);

				let yt_object = factory.c1(sv1_object);

				let sv1_left; let sv1_right;
				if(sv1_subject < sv1_object) {
					sv1_left = sv1_subject;
					sv1_right = sv1_object;
				}
				else {
					sv1_left = sv1_object;
					sv1_right = sv1_subject;
				}

				let h_neighbors = h_combos[sv1_left] = (h_combos[sv1_left] || {});
				let as_relations = h_neighbors[sv1_right] = (h_neighbors[sv1_right] || new Set());

				as_relations.add(sv1_predicate);
			}
		}
	}

	// pairwise combos that interact topologically and have cardinal direction relation
	let a_matches = [];

	// combos that do not have a relation in DBpedia
	let a_enhancements = [];

	// places that have a relation in DBpedia but are missing from out dataset
	let a_missing = [];

	let a_avoided = [];

	let n_places = as_places.size;
	let c_seen = 0;

	let y_bar = new progress('[:bar] :percent :current/:total; +:elapseds; -:etas', {
		incomplete: ' ',
		complete: '∎', // 'Ξ',
		width: 40,
		total: n_places,
	});

	let y_queue = async.queue(async(g_task, fk_task) => {
		let {
			left: sv1_left,
		} = g_task;

		let s_query = /* syntax: sparql */ `
			select * {
				{
					?left ?rel ?right .
					filter(isIri(?right))
				} union {
					?right ?rel ?left .
				}

				values ?left {
					${factory.c1(sv1_left).verbose()}
				}

				values ?right {
					${Object.keys(h_combos[sv1_left]).map(sv1_right => factory.c1(sv1_right).verbose()).join(' ')}
				}
			}
		`;

		// fetch all cardinal direciton relations involving left place
		let g_body = await request.post('http://dbpedia.org/sparql', {
			json: true,
			form: {
				query: s_query,
			},
		});

		let a_rows = g_body.results.bindings;
		if(a_rows.length) {
			// accumulate siblings from sparql resutls
			for(let g_row of a_rows) {
				let yt_rel = factory.from.sparql_result(g_row.rel);
				let sv1_rel = yt_rel.concise();

				h_counts[sv1_rel] = (h_counts[sv1_rel] || 0) + 1;
			}
		}

		y_bar.tick(1);

		fk_task();
	}, N_MAX_QUERIES);


	for(let sv1_left of as_places) {
		y_queue.push({
			left: sv1_left,
		});
	}

	console.log(`${y_queue.length()} tasks queued`);

	y_queue.drain = () => {
		let a_sorted = Object.entries(h_counts).sort((a_a, a_b) => a_b[1] - a_a[1]);
		console.log(JSON.stringify(a_sorted));
	};
})();
