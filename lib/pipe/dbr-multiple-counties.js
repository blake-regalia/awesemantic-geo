
const dbpedia = require('../util/dbpedia');
const local = require('classer').logger('dbr-multiple-counties');

let c_resources = 0;

dbpedia.test('osm_polygons where in_multiple_counties = false and is_city = true', `
		{ ?dbr dbo:isPartOf ?county1, ?county2 }
		union { ?dbr dbp:subdivisionName ?county1, ?county2 }
		filter(?county1 != ?county2)

		{ ?county1 a yago:County108546183 }
		union { ?county1 dbo:type <http://dbpedia.org/resource/County_(United_States)> }

		{ ?county2 a yago:County108546183 }
		union { ?county2 dbo:type <http://dbpedia.org/resource/County_(United_States)> }
	`, (a_items, a_bindings, y_client, fk_row) => {

		if(a_bindings.length) {
			c_resources += 1;

			local.good(a_bindings[0].dbr.value+' is in more than one county');
			y_client.query(`update osm_polygons set in_multiple_counties = true where osm_id = '${a_items[0].osm_id}'`, (e_update) => {
				if(e_update) local.fail(e_update);
			});
		}

		fk_row();
	}, () => {
		local.good(c_resources+' resources span multiple counties');
	});
