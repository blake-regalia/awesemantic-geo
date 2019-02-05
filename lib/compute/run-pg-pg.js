const async = require('async');
const cp = require('child_process');

const I_RESUME = process.argv[2] || 0;
const I_STOP = process.argv[3] || Infinity;
const A_TASKS = [
	// set src table types
	['mk-types', 'pg_pg', 'pg_disjoint_pg_dirty', 'pg_touches_pg_dirty', 'pg_overlaps_pg_dirty', 'pg_tpp_pg_dirty', 'pg_ntpp_pg_dirty', 'pg_eq_pg_dirty'],

	// pg_disjoint_pg_dirty
	['pg-disjoint-pg'],

	// pg_disjoint_pg = clean(pg_disjoint_pg_dirty)
	['filter', 'pg_disjoint_pg_dirty', 'd > 20', 'pg_disjoint_pg'],


	// pg_touches_pg_dirty = Z - pg_disjoint_pg_dirty
	['pg-verb-pg', 'touches', 'pg_disjoint_pg_dirty'],

	// pg_touches_pg = clean(pg_touches_pg_dirty) + (pg_disjoint_pg_dirty - pg_disjoint_pg) + 
	['filter', 'pg_touches_pg_dirty', 'true', 'pg_touches_pg'],
	['filter', 'pg_disjoint_pg_dirty', 'd <= 20', 'pg_touches_pg', 'append'],


	// pg_overlaps_pg_dirty = Z - pg_disjoint_pg_dirty - pg_touches_pg_dirty
	['pg-verb-pg', 'overlaps', 'pg_disjoint_pg_dirty', 'pg_touches_pg_dirty'],

	// pg_overlaps_pg = (pg_touches_pg_dirty - pg_touches_pg) + clean(pg_overlaps_pg_dirty)
	['filter', 'pg_overlaps_pg_dirty', '(ai_a1 >= 0.08 and ai_a1 <= 0.95) or ai > 50000000', 'pg_overlaps_pg'],

	// pg_equals_pg = cases_for('equals', pg_overlaps_pg_dirty)
	['filter', 'pg_overlaps_pg_dirty', 'ai_a2 >= 0.85', 'pg_equals_pg'],


	// pg_tpp_pg_dirty = Z - pg_disjoint_pg_dirty - pg_touches_pg_dirty - pg_overlaps_pg_dirty
	['pg-within-pg', 'tpp', 'pg_disjoint_pg_dirty', 'pg_touches_pg_dirty', 'pg_overlaps_pg_dirty'],

	// pg_tpp_pg = clean(pg_tpp_pg_dirty)
	['filter', 'pg_tpp_pg_dirty', 'true', 'pg_tpp_pg'],


	// pg_touches_pg += cases_for('touches', pg_overlaps_pg_dirty)
	['filter', 'pg_overlaps_pg_dirty', 'ai_a1 < 0.08 and ai < 50000000', 'pg_touches_pg', 'append'],

	// pg_tpp_pg += cases_for('tpp', pg_overlaps_pg_dirty)
	['filter', 'pg_overlaps_pg_dirty', 'ai_a1 > 0.95', 'pg_tpp_pg', 'append'],


	// pg_ntpp_pg_dirty = Z - pg_disjoint_pg_dirty - pg_touches_pg_dirty - pg_overlaps_pg_dirty - pg_tpp_pg_dirty
	['pg-within-pg', 'ntpp', 'pg_disjoint_pg_dirty', 'pg_touches_pg_dirty', 'pg_overlaps_pg_dirty', 'pg_tpp_pg_dirty'],

	// pg_ntpp_pg = clean(pg_ntpp_pg_dirty)
	['filter', 'pg_ntpp_pg_dirty', 'true', 'pg_ntpp_pg'],

	// pg_ntpp_pg += cases_for('ntpp', pg_tpp_pg_dirty)
	['filter', 'pg_overlaps_pg_dirty', 'ai_a1 > 0.95', 'pg_touches_pg', 'append'],
];

async.eachSeries(A_TASKS.slice(I_RESUME, I_STOP), (a_args, fk_task) => {
	console.log('$ node '+a_args.map(s => /\s/.test(s)? `"${s}"`: s).join(' '));
	let u_proc = cp.spawn('node', a_args, {
		cwd: __dirname,
		stdio: 'inherit',
	});
	u_proc.on('error', (e_spawn) => {
		console.error(e_spawn);
	});
	u_proc.on('exit', (n_code) => {
		if(n_code) throw 'stopping due to child process error '+n_code;
	});
	u_proc.on('close', (n_code) => {
		console.log('exit code: '+n_code);
		fk_task(null);
	});
});
