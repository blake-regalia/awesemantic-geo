
const dbpedia = require('../util/dbpedia');
const local = require('classer').logger('dbr-park');

let c_parks = 0;

dbpedia.test('osm_polygons', `
		{ ?dbr a dbo:Park }
		union { ?dbr dbo:type dbr:Urban_park }
		union { ?dbr dbp:type dbr:Urban_park }
		union { ?dbr a yago:Park108615149 }
		union { ?dbr a yago:NationalPark108600992 }
		union { ?dbr a dbo:ProtectedArea }
	`, (a_items, a_bindings, y_client, fk_row) => {

		if(a_bindings.length) {
			c_parks += 1;

			local.good(a_bindings[0].dbr.value+' is a park');
			y_client.query(`update osm_polygons set is_park = true where osm_id = '${a_items[0].osm_id}'`, (e_update) => {
				if(e_update) local.fail(e_update);
			});
		}

		fk_row();
	}, () => {
		local.good(c_parks+' parks');
	});
