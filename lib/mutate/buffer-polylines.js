const progress = require('progress');

const local = require('classer').logger('buffer-polylines');
const parallelize = require('../util/parallelize');

const N_LIMIT = 12;

let bar;
let c_inserts = 0;
let c_queries = 0;
let x_total_time = 0;
parallelize({
	count: 'osm_polylines',
	order: `id`,
	inner: `
		select
			id,
			case when polylines_sewn is not null
				then st_multi(polylines_sewn)
				else polylines
			end as geom
		from osm_polylines
	`,
	rows: N_LIMIT,
	gen: s_select => `
		update osm_polylines a set polylines_buffered = st_multi(
			st_buffer(sub.geom::geography, a.buffer_radius, 'quad_segs=2 endcap=square join=mitre')::geometry
		)
			from (${s_select}) sub
			where a.id = sub.id;
	`,
	start(n_rows) {
		bar = new progress('[:bar] :percent :current/:total; +:elapseds; -:etas (:inserts inserts; @:averages / query)', {
			incomplete: ' ',
			complete: '∎', // 'Ξ',
			width: 40,
			total: n_rows,
		});
	},
}, (e_query, h_result, x_time) => {
	c_queries += 1;
	x_total_time += x_time;
	if(e_query) local.fail(e_query);
	c_inserts += h_result.rowCount;
	bar.tick(N_LIMIT, {
		inserts: c_inserts,
		average: (x_total_time / c_queries).toFixed(2),
	});
}, () => {
	local.good('done');
});
