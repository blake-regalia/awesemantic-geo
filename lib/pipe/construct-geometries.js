
const local = require('classer').logger('query-ways-rels');

const overpass = require('../util/overpass');
const geometry = require('../util/geometry');
const pj = require('../util/pj');

const h_pg_config = require('../../database');
const db = pj(h_pg_config);

function escape_wiki_str(s_wiki) {
	return s_wiki.replace(/ /g, '_');
}

let s_all_places = `
	(
		way[wikidata];
		way["wikipedia"];
		way["wikipedia:en"];
		rel[wikidata];
		rel["wikipedia"];
		rel["wikipedia:en"];
	);
	out geom;
`;

overpass.query(s_all_places, {

	// each element
	element(h_element) {
		let {
			id: si_osm,
			type: s_osm_type,
			tags: {
				type: s_tag_type='',
				wikidata: si_wkd=null,
				wikipedia: si_wkp=null,
				'wikipedia:en': si_wkp_en=null,
			},
		} = h_element;

		// create osm reference key
		let s_osm_key = `${s_osm_type}/${si_osm}`;

		// dbr id if wkp is present
		let p_dbr_id = null;

		// wikipedia:en
		if(si_wkp_en) {
			p_dbr_id = escape_wiki_str(si_wkp_en);
		}
		// wikipedia
		else if(si_wkp && si_wkp.startsWith('en:')) {
			p_dbr_id = escape_wiki_str(si_wkp.replace(/^[a-z]+:/, ''));
		}

		// create geometry
		let h_geometry = geometry.solve(h_element);

		// cannot make geometry
		if(!h_geometry) {
			local.warn(`could not make geometry(s) from shitty ${s_osm_key}`);
		}
		// good geomeetry
		else {
			// common fields
			let h_insert = {
				osm_id: s_osm_key,
				tag_type: s_tag_type,
				wkd_id: si_wkd  || (() => 'NULL'),
				dbr_id: p_dbr_id  || (() => 'NULL'),
				// tags: () => `'${JSON.stringify(h_element.tags).replace(/'/g, '\'\'')}'::jsonb`,
			};
			
			// polygons
			if(h_geometry.polygons) {
				db.into('osm_polygons')
					.insert({
						...h_insert,
						polygons: h_geometry.polygons,
						holes: h_geometry.holes || (() => 'NULL'),
						has_relations: h_geometry.has_relations || false,
					})
					.exec(() => {
						// good
					});
			}
			// polylines
			else if(h_geometry.polylines) {
				db.into('osm_polylines')
					.insert({
						...h_insert,
						polylines: h_geometry.polylines,
						has_relations: h_geometry.has_relations || false,
					})
					.exec(() => {
						// done
					});
			}
			else {
				local.fail('geometry missing valid key');
			}
		}
	},

	end() {
		local.good('done');
	},
});
