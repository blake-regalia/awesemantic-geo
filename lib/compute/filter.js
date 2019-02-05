const pj = require('../util/pj');
const h_pg_config = require('../../database');
const db = pj(h_pg_config);
const local = require('classer').logger('filter');

let [
	s_table_src,
	s_filter,
	s_table_dest,
	s_append,
] = process.argv.slice(2);

let s_src_type = s_table_src.slice(0, 2)+'_'+s_table_dest.slice(-2);

local.info(`${s_table_src} where ${s_filter} ${s_append? '+': '='}> ${s_table_dest}`);
if(s_append) {
	db.query(`
		with filter_rows as (
			select *
			from ${s_table_src} src
			where ${s_filter}
		) insert into ${s_table_dest}
		select
			f.id z_id,
			f.a_id a_id,
			f.b_id b_id,
			'${s_table_src}'::enum_src_table_${s_src_type} z_src
		from filter_rows f
	`, (e_query, w_result) => {
		if(e_query) local.fail(e_query);
		local.good('done');
		db.end();
	});
}
else {
	db.query(`drop table if exists ${s_table_dest}`, () => {
		db.query(`
			create table ${s_table_dest}
			as (
				select
					f.id z_id,
					f.a_id a_id,
					f.b_id b_id,
					'${s_table_src}'::enum_src_table_${s_src_type} z_src
				from ${s_table_src} f
				where ${s_filter}
			)
		`, (e_query, w_result) => {
			if(e_query) local.fail(e_query);
			local.good('done');
			db.end();
		});
	});
}
