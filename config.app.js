module.exports = {
	database: require(__dirname+'/database.js'),
	prefixes: {
		agt: 'http://awesemantic-geo.link/topology/',
		ago: 'http://awesemantic-geo.link/ontology/',
		dbr: 'http://dbpedia.org/resource/',
		rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
		rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
		stko: 'http://stko.geog.ucsb.edu/ontology/',
		xsd: 'http://www.w3.org/2001/XMLSchema#',
		osm: 'http://openstreetmap.org/',
		wkd: 'http://www.wikidata.org/entity/',
		geo: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
	},
};
