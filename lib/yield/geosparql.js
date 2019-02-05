const fs = require('fs');
const pg = require('pg');
const pg_cursor = require('pg-cursor');
const progress = require('progress');
const graphy = require('graphy');

const g_config = require('../../config.app.js');

const N_READ = 1 << 10;


const H_TYPES = {
	park: 'Park',
	city: 'City',
	county: 'County',
	road: 'Road',
	stream: 'Stream',
};

(async() => {
	let ds_writer = graphy.content.ttl.write({
		prefixes: {
			dbr: 'http://dbpedia.org/resource/',
			geosparql: 'http://www.opengis.net/ont/geosparql#',
			experiment: 'http://stko.geog.ucsb.edu/experiment#',
		},
	});

	ds_writer.pipe(process.stdout);

	let ds_geoms = fs.createWriteStream(null, {
		fd: 3,
	});

	let y_pool = new pg.Pool(g_config.database);


	let y_client_pg = await y_pool.connect();
	let y_client_pl = await y_pool.connect();

	let c_total_pg = (await y_client_pg.query(/* syntax: sql */ `
		select count(*) as count from osm_polygons
	`)).rows[0].count;

	let c_total_pl = (await y_client_pl.query(/* syntax: sql */ `
		select count(*) as count from osm_polylines
	`)).rows[0].count;

	let c_total = (+c_total_pg) + (+c_total_pl);

	let y_bar = new progress('[:bar] :percent :current/:total; +:elapseds; -:etas', {
		incomplete: ' ',
		complete: '∎', // 'Ξ',
		width: 40,
		total: c_total,
	});


	let y_cursor_pg = y_client_pg.query(new pg_cursor(/* syntax: sql */ `
		select dbr_id, is_park, is_city, is_county,
			polygons_valid as wkb,
			st_asText(polygons_valid) as wkt
			from osm_polygons where polygons_valid is not null
	`));

	let y_cursor_pl = y_client_pl.query(new pg_cursor(/* syntax: sql */ `
		select dbr_id, is_road, is_stream,
			polylines as wkb,
			st_asText(polylines) as wkt
			from osm_polylines where polylines is not null
	`));


	let read_more = (y_cursor, y_client) => {
		y_cursor.read(N_READ, (e_read, a_rows) => {
			if(e_read) throw e_read;

			if(!a_rows.length) {
				y_client.end();
				return;
			}

			let a_writes = [];
			let s_geoms = '';
			for(let g_row of a_rows) {
				let p_dbr_geom = `http://awesemantic-geo.link/geometry/dbr:${g_row.dbr_id}`;

				let a_types = [];
				for(let [s_type, s_label] of Object.entries(H_TYPES)) {
					if(g_row['is_'+s_type]) {
						a_types.push(`experiment:${s_label}`);
					}
				}

				let g_wkt_literal = {};
				if(g_row.wkt.length < 2500) {
					g_wkt_literal = {
						['>'+p_dbr_geom]: {
							'geosparql:asWKT': '^geosparql:wktLiteral"<http://www.opengis.net/def/crs/OGC/1.3/CRS84>'+g_row.wkt,
						},
					};
				}

				a_writes.push({
					type: 'c3',
					value: {
						['dbr:'+g_row.dbr_id]: {
							a: a_types,
							'geosparql:hasGeometry': '>'+p_dbr_geom,
						},
						...g_wkt_literal,
					},
				});

				s_geoms += `${p_dbr_geom}\t${g_row.wkb}\n`;
			}

			ds_writer.write({
				type: 'array',
				value: a_writes,
			});

			ds_geoms.write(s_geoms);

			y_bar.tick(a_rows.length);

			setTimeout(() => {
				read_more(y_cursor, y_client);
			}, 0);
		});
	};

	read_more(y_cursor_pg, y_client_pg);
	read_more(y_cursor_pl, y_client_pl);
})();
