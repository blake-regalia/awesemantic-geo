const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const mkdirp = require('mkdirp');
const local = require('classer').logger('extract-pbf');

const P_ROOT = path.join(__dirname, '../..');

// path to osmconvert binary
const P_OSMCONVERT = (() => {
	try {
		fs.accessSync(P_ROOT+'/bin/osmconvert', fs.X_OK);
		return P_ROOT+'/bin/osmconvert';
	}
	catch(e) {
		return 'osmconvert';
	}
})();

// path to input .osm.pbf file
const P_OSM_PBF_SRC = process.argv[2] || P_ROOT+'/data/osm/north-america-latest.osm.pbf';

// path to output directory
const P_OUTPUT_DIR = P_ROOT+'/data/overpass';

// path to binary for updating overpass
const P_OVERPASS_UPDATE = P_ROOT+'/bin/overpass/bin/update_database';


// load pbf file into database
function load_pbf(p_osm_pbf, fk_pbf) {

	// verbose
	local.info(`loading ${p_osm_pbf}...`);

	// launch user process for osmconvert
	let u_convert = cp.spawn(P_OSMCONVERT, ['--out-osm', p_osm_pbf]);

	// launch user process for update
	let u_update = cp.spawn(P_OVERPASS_UPDATE, [`--db-dir=${P_OUTPUT_DIR}`], {
		encoding: 'utf8',
	});

	// pipe stdout from osmconvert to update's stdin
	u_convert.stdout.pipe(u_update.stdin);

	// forward stderr from each process
	u_convert.stderr.pipe(process.stderr);
	u_update.stderr.pipe(process.stderr);

	// update process finishes
	u_update.on('exit', () => {
		local.good(`finished converting ${p_osm_pbf}`);

		// done
		fk_pbf && fk_pbf();
	});
}


// make output dir
mkdirp.sync(P_OUTPUT_DIR);

// load pbf file
load_pbf(P_OSM_PBF_SRC);
