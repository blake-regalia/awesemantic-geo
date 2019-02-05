// native imports
const cp = require('child_process');
const path = require('path');

// third-party modules
const local = require('classer').logger('overpass');
const es = require('event-stream');
const json_stream = require('JSONStream');

// path to root directory
const P_ROOT = path.join(__dirname, '../..');


// arguments to all overpass queries
const a_args = [`--db-dir=${P_ROOT}/data/overpass`, '--concise', '--rules'];

// options to all overpass queries
const h_options = {
	stdio: 'pipe',
};


module.exports = {

	// submit overpass query
	query(s_input_query, h_events) {
		// concatenate and sanitize query
		let s_query = `[out:json][timeout:1800];${s_input_query}`.replace(/\s*\n+\s*/g, '');

		// spawn overpass query command
		let u_query = cp.spawn(P_ROOT+'/bin/overpass/bin/osm3s_query', a_args, h_options);

		// abort flag for child process
		let b_abort = false;

		// set encoding on stdios
		u_query.stdin.setEncoding('utf8');
		u_query.stdout.setEncoding('utf8');
		u_query.stderr.setEncoding('utf8');

		// parse json as stream
		u_query.stdout
			.pipe(json_stream.parse('elements.*'))
			.pipe(es.mapSync(h_events.element))
			.on('end', () => {
				h_events.end();
			});

		// something wrong with query
		u_query.stderr.on('data', (s_err) => {
			//
			s_err.split(/\n/g).forEach((s_err_line) => {
				// no alarm, just the greeting message
				if(/CTRL\+D.\s*$|^\s*$/.test(s_err_line)) return;

				// log error message
				local.error(s_err_line);

				// abort
				b_abort = true;
			});
		});

		// something wrong with query
		u_query.stderr.on('end', () => {

			// die on error message
			if(b_abort) local.fail('aborting due to messages printed on stderr');
		});

		// write query to stdin and close stream
		u_query.stdin.end(s_query);
	},
};
