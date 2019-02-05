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

let s_mode = process.argv[2] || 'adjacency';

let h_relations = {
	adjacency: {
		agts: ['touches', 'broadlyTouches'],
		values: `
			dbo:north
			dbo:northeast
			dbo:east
			dbo:southeast
			dbo:south
			dbo:southwest
			dbo:west
			dbo:northwest
			dbp:north
			dbp:northeast
			dbp:east
			dbp:southeast
			dbp:south
			dbp:southwest
			dbp:west
			dbp:northwest
		`,
	},
	partonomy: {
		agts: ['tpp', 'ntpp', 'broadlyTPP'],
		values: 'dbo:isPartOf',
	},

		// dbo:country
		// dbo:location
		// dbo:locatedInArea
		// dbo:district
		// dbo:location
		// dbo:counties
		// dbp:border

};

(async() => {

	let as_polygons;
	let as_polylines;
	{
		let y_client = new pg.Client(g_database);
		y_client.connect();

		let g_result_pg = await y_client.query(/* syntax: sql */ `
			select dbr_id from osm_polygons where is_park = true or is_city = true or is_county = true;
		`);

		as_polygons = new Set(g_result_pg.rows.map(g_row => g_row.dbr_id));

		let g_result_pl = await y_client.query(/* syntax: sql */ `
			select dbr_id from osm_polylines where is_road = true or is_stream = true;
		`);

		as_polylines = new Set(g_result_pl.rows.map(g_row => g_row.dbr_id));

		y_client.end();
	}

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
	let a_accurate = [];

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

		let g_relation = h_relations[s_mode];
		let a_agts_expect = g_relation.agts.map(s => `>http://awesemantic-geo.link/topology/${s}`);

		// fetch all cardinal direciton relations involving left place
		let g_body = await request.post('http://dbpedia.org/sparql', {
			json: true,
			form: {
				query: /* syntax: sparql */ `
					select * {
						{
							?left ?rel ?right .
							filter(isIri(?right))
						} union {
							?right ?rel ?left .
						}

						values ?rel {
							${g_relation.values}
						}

						values ?left {
							${factory.c1(sv1_left).verbose()}
						}
					}
				`,
			},
		});

		let a_rows = g_body.results.bindings;
		if(a_rows.length) {
			// debugger;

			// 'sibling' is a place that has cardinal direction relatino to/from left place
			let hm_siblings = new Map();

			// accumulate siblings from sparql resutls
			for(let g_row of a_rows) {
				let yt_left = factory.from.sparql_result(g_row.left);
				let yt_rel = factory.from.sparql_result(g_row.rel);
				let yt_right = factory.from.sparql_result(g_row.right);

				let sv1_right = yt_right.concise();

				// reuse existing mapping
				let as_relations = hm_siblings.get(sv1_right);

				// mapping not exists
				if(!as_relations) {
					as_relations = new Set();
					hm_siblings.set(sv1_right, as_relations);
				}

				// add relation to set within mapping value
				as_relations.add(yt_rel.concise());
			}

			// ref neighbors
			let h_neighbors = {...h_combos[sv1_left]};
			// let as_neighbors = Object.keys(h_neighbors);

			// each cardinal sibling
			for(let [sv1_right, as_relations] of hm_siblings) {
				// already accounted for in other combo; skip this one
				if(h_combos[sv1_right] && h_combos[sv1_right][sv1_left]) {
					if(h_neighbors[sv1_right]) {
						// this should not happen
						debugger;
					}
					continue;
				}

				let g_descriptor = {
					left: sv1_left,
					right: sv1_right,
					dbps: [...as_relations],
				};

				// neighbor exists
				if(sv1_right in h_neighbors) {
					// // add to matches
					// a_matches.push({
					// 	...g_descriptor,
					// 	agts: [...h_neighbors[sv1_right]],
					// });

					// has expected agt(s)
					let b_accurate = false;
					let a_agts_actual = [...h_neighbors[sv1_right]];
					for(let sv1_agt_actual of a_agts_actual) {
						if(a_agts_expect.includes(sv1_agt_actual)) {
							b_accurate = true;
							break;
						}
					}

					let g_localized = {
						...g_descriptor,
						agts: [...h_neighbors[sv1_right]],
					};

					if(b_accurate) {
						a_accurate.push(g_localized);
					}
					else {
						a_matches.push(g_localized);
					}
					

					// remove from pending neighbors
					delete h_neighbors[sv1_right];
				}
				// sibling not in neighborhood
				else {
					let si_right = sv1_right.slice('>http://dbpedia.org/resource/'.length);

					// sibling is in set
					if(as_polygons.has(si_right) || as_polylines.has(si_right)) {
						a_missing.push(g_descriptor);
					}
					// not in set, skip!
					else {
						a_avoided.push(g_descriptor);
					}
				}
			}

			// neighbors remain
			for(let sv1_neighbor in h_neighbors) {
				a_enhancements.push({
					left: sv1_left,
					right: sv1_neighbor,
					agts: [...h_neighbors[sv1_neighbor]],
				});
			}

			// debugger;
		}

		y_bar.tick(1);

		fk_task();
	}, N_MAX_QUERIES);


	for(let sv1_left of as_places) {
		y_queue.push({
			left: sv1_left,
		});
	}

	y_queue.drain = () => {
		process.stdout.write(JSON.stringify({
			matches: a_matches,
			accurate: a_accurate,
			enhancements: a_enhancements,
			missing: a_missing,
			avoided: a_avoided,
		}));
	};
})();
