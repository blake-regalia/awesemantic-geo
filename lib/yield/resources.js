const fs = require('fs');
const graphy = require('graphy-dev');
const pj = require('../util/pj');

const h_pg_config = require('../../database');
const db = pj(h_pg_config);

let ds_writer = graphy.content.ttl.write({
	prefixes: require(__dirname+'/../../config.app.js').prefixes,
});
let ds_out = fs.createWriteStream(__dirname+'/../../data/triples/resources.ttl');
db.from('osm_polygons').exec((a_rows) => {
	a_rows.forEach((h_row) => {
		// types
		let a_types = [];

		// rdf:type(s)
		if(h_row.is_city) a_types.push('stko:City');
		if(h_row.is_park) a_types.push('stko:Park')
		if(h_row.is_county) a_types.push('stko:County')

		// open street map node
		ds_writer.write({
			type: 'c3',
			value: {
				['dbr:'+h_row.dbr_id]: {
					a: a_types,
					['stko:osm']: 'osm:'+h_row.osm_id,
				},
			},
		});
	});

	// end writer
	ds_writer.end();
});
