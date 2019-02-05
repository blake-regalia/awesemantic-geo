// [ { key: 'matches', count: 10814 },
//   { key: 'enhancements', count: 15829 },
//   { key: 'missing', count: 3935 },
//   { key: 'avoided', count: 5407 } ]

const progress = require('progress');
const pg = require('pg');

let g_database = require('../../config.app.js').database;
let s_mode = process.argv[2];
let s_data = '';
process.stdin
	.on('data', (s_chunk) => {
		s_data += s_chunk;
	})
	.on('end', async () => {
		let g_ground = JSON.parse(s_data);
		let a_missing = g_ground.missing;

		let y_client = new pg.Client(g_database);

		y_client.connect();

		let x_most = 0;
		let sv1_most;

		let y_bar = new progress('[:bar] :percent :current/:total; +:elapseds; -:etas', {
			incomplete: ' ',
			complete: '∎', // 'Ξ',
			width: 40,
			total: a_missing.length,
		});

		for(let g_missing of a_missing) {
			let si_dbr = g_missing.left.slice('>http://dbpedia.org/resource/'.length);
			let x_area = (await y_client.query(/* syntax: sql */ `
				select st_area(polygons_valid) as area from osm_polygons where dbr_id=$1;
			`, [si_dbr])).rows[0].area;

			if(x_area > x_most) {
				x_most = x_area;
				sv1_most = g_missing.left;
			}

			y_bar.tick(1);
		}

		console.log(sv1_most);

		y_client.end();
	});
