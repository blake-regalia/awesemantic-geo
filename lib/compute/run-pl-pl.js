const async = require('async');
const cp = require('child_process');

const I_RESUME = process.argv[2] || 0;
const I_STOP = process.argv[3] || Infinity;
const A_TASKS = [
	// set src table types
	['mk-types', 'pl_pl', 'pl_disjoint_pl_dirty', 'pl_crosses_pl_dirty', 'pl_overlaps_pl_dirty', 'pl_connects_pl_dirty', 'pl_runs_along_pl_dirty'],

	// pl_disjoint_pl_dirty
	['pl-disjoint-pl'],

	// pl_disjoint_pl = clean(pl_disjoint_pl_dirty)
	['filter', 'pl_disjoint_pl_dirty', 'd > 20', 'pl_disjoint_pl'],


	// pl_crosses_pl_dirty = Z - pl_disjoint_pl_dirty
	['pl-verb-pl', 'crosses', 'null', 'pl_disjoint_pl_dirty'],

	// pl_crosses_pl = clean(pl_crosses_pl_dirty)
	['filter', 'pl_crosses_pl_dirty', 'li <= 0', 'pl_crosses_pl'],

	// pl_overlaps_pl = cases_for('overlaps', pl_crosses_pl)
	['filter', 'pl_crosses_pl_dirty', 'li > 0', 'pl_overlaps_pl'],

	// pl_connects_pl_dirty = cases_for('connects', pl_crosses_pl_dirty)
	['pl-verb-pl', 'connects', 'null', 'pl_disjoint_pl_dirty'],

	// pl_connects_pl = clean(pl_connects_pl_dirty)
	['filter', 'pl_connects_pl_dirty', 'ln > 300 and nd < 100', 'pl_connects_pl'],


	// pl_runs_along_pl_dirty = cases_for('connects', pl_crosses_pl_dirty) - pl_connects_pl
	['pl-cognitive-pl', 'runs_along', 'pl_disjoint_pl_dirty', 'pl_connects_pl'],

	// pl_runs_along_pl = cases_for('connects', pl_crosses_pl_dirty)
	['filter', 'pl_runs_along_pl_dirty', 'ln > 300 and lnrx > 8 and c > 12.5', 'pl_runs_along_pl'],

	// // pl_touches_pg = clean(pl_touches_pg_dirty) + (pl_disjoint_pg_dirty - pl_disjoint_pg) + 
	// ['filter', 'pl_touches_pg_dirty', 'true', 'pl_touches_pg'],
	// ['filter', 'pl_disjoint_pg_dirty', 'd <= 20', 'pl_touches_pg', 'append'],


	// // pl_crosses_pg_dirty = Z - pl_disjoint_pg_dirty - pl_touches_pg_dirty
	// ['pl-verb-pg', 'crosses', 'pl_disjoint_pg_dirty', 'pl_touches_pg_dirty'],

	// // pl_crosses_pg = (pl_touches_pg_dirty - pl_touches_pg) + clean(pl_crosses_pg_dirty)
	// ['filter', 'pl_crosses_pg_dirty', 'li_p1 >= 0.08 and li_p1 <= 0.95', 'pl_crosses_pg'],


	// // pl_within_pg_dirty = Z - pl_disjoint_pg_dirty - pl_touches_pg_dirty - pl_crosses_pg_dirty
	// ['pl-within-pg', 'within', 'pl_disjoint_pg_dirty', 'pl_touches_pg_dirty', 'pl_crosses_pg_dirty'],

	// // pl_within_pg = clean(pl_within_pg_dirty)
	// ['filter', 'pl_within_pg_dirty', 'true', 'pl_within_pg'],


	// // pl_touches_pg += cases_for('touches', pl_crosses_pg_dirty)
	// ['filter', 'pl_crosses_pg_dirty', 'li_p1 < 0.08', 'pl_touches_pg', 'append'],

	// // pl_within_pg += cases_for('within', pl_crosses_pg_dirty)
	// ['filter', 'pl_crosses_pg_dirty', 'li_p1 > 0.95', 'pl_within_pg', 'append'],

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
