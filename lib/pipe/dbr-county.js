
const dbpedia = require('../util/dbpedia');
const local = require('classer').logger('dbr-county');

let c_counties = 0;

dbpedia.test('osm_polygons', `
		{ ?dbr a yago:County108546183 .
		} union {
			?dbr dbo:type <http://dbpedia.org/resource/County_(United_States)> .
		}
	`, (a_items, a_bindings, y_client, fk_row) => {

		if(a_bindings.length) {
			c_counties += 1;

			local.good(a_bindings[0].dbr.value+' is a county');
			y_client.query(`update osm_polygons set is_county = true where osm_id = '${a_items[0].osm_id}'`, (e_update) => {
				if(e_update) local.fail(e_update);
			});
		}

		fk_row();
	}, () => {
		local.good(c_counties+' counties');
	});
