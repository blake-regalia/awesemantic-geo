const pj = require('../util/pj');
const h_pg_config = require('../../database');
const db = pj(h_pg_config);
const local = require('classer').logger('filter');

let s_which = process.argv[2];
let a_types = process.argv.slice(3);

local.info('creating enum type');
db.query(`drop type if exists enum_src_table_${s_which} cascade`, (e_drop_type) => {
	if(e_drop_type) local.fail(e_drop_type);
	db.query(`
		create type enum_src_table_${s_which} as enum (${a_types.map(s => `'${s}'`).join(',')})
	`, (e_create_type) => {
		if(e_drop_type) local.fail(e_create_type);
		local.good('done');
		db.end();
	});
});
