const fs = require('fs');
const cp = require('child_process');
const util = require('util');

const async = require('async');
const pg = require('pg');

const h_pg_config = require(__dirname+'/../database.js');
const a_psql_args = [
	`postgres://${h_pg_config.user}${h_pg_config.password? ':'+h_pg_config.password: ''}@${h_pg_config.host || 'localhost'}/${h_pg_config.database}`,
];

//
function exec_sql(p_file, a_args, h_handle, fk_done) {
	// create read stream from sql file
	let ds_sql = fs.createReadStream(p_file);

	// spawn child psql process
	let u_psql = cp.spawn('psql', a_args);

	// pipe sql file into process stdin
	ds_sql.pipe(u_psql.stdin);

	// colllect stderr from process
	let s_stderr = '';
	u_psql.stderr.on('data', (s_chunk) => {
		s_stderr += s_chunk;
	});

	// once process closes
	u_psql.on('close', () => {
		if(s_stderr) {
			h_handle.error && h_handle.error(s_stderr);
		}
		else {
			h_handle.okay && h_handle.okay();
		}

		// done
		fk_done();
	});
}

module.exports = function(gulp, $, p_src, p_dest) {

	// tasks
	async.series([
		// create database
		(fk_task) => {
			exec_sql(p_src+'/database.create.sql', ['postgres://script:pass@localhost/script'], {
				error(e_create) {
					$.util.log($.util.colors.red(`failed to create database: ${e_create}`));
				},
				okay() {
					$.util.log($.util.colors.green('loaded database.create.sql'));
				},
			}, fk_task);
		},

		// create extension
		(fk_task) => {
			exec_sql(p_src+'/extension.postgis.create.sql', a_psql_args, {
				error(e_create) {
					$.util.log($.util.colors.red(`failed to create postgis extension: ${e_create}`));
				},
				okay() {
					$.util.log($.util.colors.green('loaded extension.postgis.create.sql'));
				},
			}, fk_task);
		},

		// create tables
		(fk_task) => {
			// fetch tables to create from directory
			let a_tables = fs.readdirSync(p_src+'/').filter((s_file) => {
				return /^table\.(.+)\.create.sql$/.test(s_file);
			});

			// each sql file in directory
			async.eachSeries(a_tables, (s_file, fk_table) => {
				exec_sql(p_src+'/'+s_file, a_psql_args, {
					error(e_create) {
						$.util.log($.util.colors.red(`error loading ${s_file}: ${e_create}`));
					},
					okay() {
						$.util.log($.util.colors.green('loaded '+s_file));
					},
				}, fk_table);
			}, () => {
				// done with task
				fk_task();
			});
		},

		// create views
		(fk_task) => {
			// fetch views to create from directory
			let a_views = fs.readdirSync(p_src+'/').filter((s_file) => {
				return /^view\.(.+)\.create.sql$/.test(s_file);
			});

			// each sql file in directory
			async.eachSeries(a_views, (s_file, fk_table) => {
				exec_sql(p_src+'/'+s_file, a_psql_args, {
					error(e_create) {
						$.util.log($.util.colors.red(`error loading ${s_file}: ${e_create}`));
					},
					okay() {
						$.util.log($.util.colors.green('loaded '+s_file));
					},
				}, fk_table);
			}, () => {
				// done with task
				fk_task();
			});
		},
	]);
};
