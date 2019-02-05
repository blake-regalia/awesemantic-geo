
const dbpedia = require('../util/dbpedia');
const local = require('classer').logger('dbr-roads');

let c_resources = 0;

dbpedia.test('osm_polylines', `
		{ ?dbr a dbo:Road }
		union { ?dbr a dbo:RouteOfTransportation }
		union { ?dbr a yago:Highway103519981 }
	`, (a_items, a_bindings, y_client, fk_row) => {

		if(a_bindings.length) {
			c_resources += 1;

			local.good(a_bindings[0].dbr.value+' is a road');
			y_client.query(`update osm_polylines set is_road = true where osm_id = '${a_items[0].osm_id}'`, (e_update) => {
				if(e_update) local.fail(e_update);
			});
		}

		fk_row();
	}, () => {
		local.good(c_resources+' roads');
	});
