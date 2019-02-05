const async = require('async');
const cp = require('child_process');

const I_RESUME = process.argv[2] || 0;
const I_STOP = process.argv[3] || Infinity;
const A_TASKS = [
	// set src table types
	['mk-types', 'pl_pg', 'pl_disjoint_pg_dirty', 'pl_touches_pg_dirty', 'pl_crosses_pg_dirty', 'pl_within_pg_dirty'],

	// pl_disjoint_pg_dirty
	['pl-disjoint-pg'],

	// pl_disjoint_pg = clean(pl_disjoint_pg_dirty)
	['filter', 'pl_disjoint_pg_dirty', 'd > 20', 'pl_disjoint_pg'],


	// pl_touches_pg_dirty = Z - pl_disjoint_pg_dirty
	['pl-verb-pg', 'touches', 'pl_disjoint_pg_dirty'],

	// pl_touches_pg = clean(pl_touches_pg_dirty) + (pl_disjoint_pg_dirty - pl_disjoint_pg) + 
	['filter', 'pl_touches_pg_dirty', 'true', 'pl_touches_pg'],
	['filter', 'pl_disjoint_pg_dirty', 'd <= 20', 'pl_touches_pg', 'append'],

	/* cognitive relation: */
	// pl_runs_along_pg = cases_for('runsAlong', pl_touches_pg)
	// ['filter', 'pl_touches_pg_dirty', 'lib >= 30', 'pl_runs_along_pg'],

	// // pl_barely_touches_pg = cases_for('barelyTouches', pl_touches_pg)
	// ['filter', 'pl_touches_pg_dirty', 'lib <= 10', 'pl_barely_touches_pg'],

	// pl_crosses_pg_dirty = Z - pl_disjoint_pg_dirty - pl_touches_pg_dirty
	['pl-verb-pg', 'crosses', 'pl_disjoint_pg_dirty', 'pl_touches_pg_dirty'],

	// pl_crosses_pg = (pl_touches_pg_dirty - pl_touches_pg) + clean(pl_crosses_pg_dirty)
	['filter', 'pl_crosses_pg_dirty', 'li_p1 >= 0.08 and li_p1 <= 0.95', 'pl_crosses_pg'],


	// pl_within_pg_dirty = Z - pl_disjoint_pg_dirty - pl_touches_pg_dirty - pl_crosses_pg_dirty
	['pl-within-pg', 'within', 'pl_disjoint_pg_dirty', 'pl_touches_pg_dirty', 'pl_crosses_pg_dirty'],

	// pl_within_pg = clean(pl_within_pg_dirty)
	['filter', 'pl_within_pg_dirty', 'true', 'pl_within_pg'],


	// pl_touches_pg += cases_for('touches', pl_crosses_pg_dirty)
	['filter', 'pl_crosses_pg_dirty', 'li_p1 < 0.08', 'pl_touches_pg', 'append'],

	// pl_within_pg += cases_for('within', pl_crosses_pg_dirty)
	['filter', 'pl_crosses_pg_dirty', 'li_p1 > 0.95', 'pl_within_pg', 'append'],

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
