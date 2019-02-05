
const dbpedia = require('../util/dbpedia');
const local = require('classer').logger('dbr-rivers');

let c_resources = 0;

dbpedia.test('osm_polylines', `
		{ ?dbr a dbo:River }
		union { ?dbr a dbo:Stream }
		union { ?dbr dbo:type dbr:River }
		union { ?dbr a yago:River109411430 }
		union { ?dbr a yago:Stream109448361 }
	`, (a_items, a_bindings, y_client, fk_row) => {

		if(a_bindings.length) {
			c_resources += 1;

			local.good(a_bindings[0].dbr.value+' is a stream');
			y_client.query(`update osm_polylines set is_stream = true where osm_id = '${a_items[0].osm_id}'`, (e_update) => {
				if(e_update) local.fail(e_update);
			});
		}

		fk_row();
	}, () => {
		local.good(c_resources+' streams');
	});
