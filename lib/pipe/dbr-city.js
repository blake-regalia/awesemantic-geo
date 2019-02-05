
const dbpedia = require('../util/dbpedia');
const local = require('classer').logger('dbr-city');

let c_cities = 0;

dbpedia.test('osm_polygons', `
	{ ?dbr a dbo:City . }
	union { ?dbr a dbo:Town . }
	union { ?dbr a yago:City108524735 . }
	`, (a_items, a_bindings, y_client, fk_row) => {

		if(a_bindings.length) {
			c_cities += 1;

			local.good(a_bindings[0].dbr.value+' is a city');
			y_client.query(`update osm_polygons set is_city = true where osm_id = '${a_items[0].osm_id}'`, (e_update) => {
				if(e_update) local.fail(e_update);
			});
		}
		else {
			local.warn('not a city');
		}

		fk_row();
	}, () => {
		local.good(c_cities+' cities');
		local.warn('waiting for inserts to terminate...');
	});
