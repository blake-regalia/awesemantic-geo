let s_relation = process.argv[2];
let a_disjoints = process.argv.slice(3);
let s_code = `pl_${s_relation}_pg_dirty`;

const H_METRICS = {
	within: {
		where: 'st_within(a_polylines, b_polygons)',
		selects: {},
	},
	equals: {
		where: 'st_equal(a_polylines, b_polygons)',
	},
};

let h_metric = H_METRICS[s_relation];

const compute = require('./compute.js');
compute(s_code, h_metric, (a_metric_selects, N_LIMIT, a_metric_fields) => ({
	count: 'osm_polylines where (is_stream = true or is_road = true)',
	inner: `
		select
			a0.id,
			a0.polylines
		from osm_polylines a0
		where (a0.is_stream = true or a0.is_road = true)
	`,
	rows: N_LIMIT,
	order: 'id',
	gen: (s_select) => `
		with copy_rows as (
			select
				gen_random_uuid() id,
				a_id,
				b_id
			from (
				select a_id, b_id, a_polylines, b_polygons
				from (
					select
						a.id as a_id,
						b.id as b_id,
						a.polylines as a_polylines,
						b.polygons as b_polygons
					from ${s_select} a cross join osm_polygons b
					where a.polylines && b.polygons
						${a_disjoints.map((s_disjoint) => `
							and (a.id, b.id) not in (
								select a_id, b_id
								from ${s_disjoint}
							)`).join('')}
				) i
				where ${h_metric.where}
			) j
		) insert into ${s_code}
			(id, a_id, b_id${a_metric_fields.map(s => ', '+s).join('')})
		select * from copy_rows
		`,
}));