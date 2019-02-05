
const path = require('path');

// third-party modules
const classer = require('classer');
const express = require('express');
const h_argv = require('minimist')(process.argv.slice(2));
const pg = require('pg');
const body_parser = require('body-parser');

// local classes / configs
const app_config = require('../../config.app.js');

// initiate connection poool
let y_pool = new pg.Pool(app_config.database);

const N_PORT = h_argv.p || h_argv.port || 80;

const local = classer.logger('server');

const k_app = express();

k_app.engine('pug', require('pug').__express);
k_app.set('views', 'lib/webapp/_layouts');

k_app.use(body_parser.urlencoded({extended: true}));

// static routing
k_app.use('/scripts', express.static(__dirname+'/../../dist/webapp/scripts'));
k_app.use('/styles', express.static(__dirname+'/../../dist/webapp/styles'));
k_app.use('/resource', express.static(__dirname+'/../../lib/webapp/_resources'));

k_app.post('/pg', (d_req, d_res) => {
	// grab client from pool
	y_pool.connect((e_connect, y_client, fk_client) => {
		if(e_connect) local.fail(e_connect);

		// execute query
		y_client.query(d_req.body.query, (e_query, w_result) => {
			// release client back to pool
			fk_client();

			// forward to callback
			if(e_query) {
				debugger;
				d_res.send({
					error: e_query,
				});
			}
			else {
				d_res.send({
					result: w_result,
				});
			}
		});
	});
});

k_app.get(['/', /^\/[a-z]+(_[a-z]+)+$/], (d_req, d_res) => {
	d_res.render('pub.pug');
});

k_app.listen(N_PORT, () => {
	local.good('running on port '+N_PORT);
});
