
const cp = require('child_process');
const path = require('path');

const mkdirp = require('mkdirp');
const local = require('classer').logger('download-pbf-region');

// prep region
let s_region = process.argv[2] || 'north-america';

// output dir
let p_osm_dir = path.join(__dirname+`/../../data/osm`);

// make output directory
mkdirp.sync(p_osm_dir);

// spawn wget process
let u_download_pbf = cp.spawn('wget', [
	'--level=1',
	'--no-directories',
	'--recursive',
	'--no-parent',
	'--accept-regex',
	'(^|\/)[a-z].*latest.osm.pbf',
	'-k', `http://download.geofabrik.de/${s_region}-latest.osm.pbf`,
], {
	stdio: ['ignore', 'inherit', 'inherit'],
	cwd: p_osm_dir,
});

// update process finishes
u_download_pbf.on('exit', () => {
	local.good(`finished downloading ${s_region} region`);
});
