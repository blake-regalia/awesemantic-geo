

const pj = require('../util/pj');
const h_pg_config = require('../../database');
const db = pj(h_pg_config);


const csv = require('csv-write-stream');

let a_fields = [
	'a_osm_id',
	'b_osm_id',
	'a_dbr_id',
	'b_dbr_id',
	'ai',
	'ai_a1',
	'lib',
	'lib_p1',
	'ad',
	'ad_a1',
];

const y_csv = csv({
	headers: a_fields,
	separator: '|',
});

db.from(`pg_overlaps_pg c
	left join osm_polygons a
		on c.a_id=a.id
	left join osm_polygons b
		on c.b_id=b.id
`).select('a.dbr_id, b.dbr_id, c.ai_a1')
.where('c.ai_a1 > 0.999')
.each((h_row) => {
	
}, (y_pool) => {
	y_pool.end();
});
