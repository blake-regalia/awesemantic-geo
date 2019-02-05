let s_code = 'pl_disjoint_pg_dirty';

let h_metric = {
	selects: {
		// distance
		d: 'd',
		// d_p1: 'd / p1',
		// d_p2: 'd / p2',

		// distance over sqaure root of area
		d_sra1: 'd / (|/ st_area(b_polygons::geography))'

		// // distance of centroids
		// dc: 'st_distance(st_centroid(a_polygons)::geography, st_centroid(b_polygons)::geography, true)',

		// // distance of furthest points
		// df: 'st_length(st_longestline(a_polygons, b_polygons)::geography, true)',
	},
};

const compute = require('./compute.js');
compute(s_code, h_metric, (a_metric_selects, N_LIMIT, a_metric_fields) => ({
	count: 'osm_polylines where (is_stream = true or is_road = true)',
	inner: `
		select
			a0.id,
			a0.polylines,
			st_buffer(st_envelope(a0.polylines), 0.06, 'join=mitre') as bbb
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
				b_id,
				${a_metric_selects.join(', ')}
			from (
				select a_id, b_id, a_polylines, b_polygons,
					st_distance(a_polylines::geography, b_polygons::geography, true) d
				from (
					select a_id, b_id, a_polylines, b_polygons
					from (
						select
							a.id a_id, b.id b_id,
							a.polylines a_polylines,
							b.polygons b_polygons
						from ${s_select} a cross join osm_polygons b
						where a.bbb && b.polygons
					) i
					where st_disjoint(a_polylines, b_polygons)
				) j
			) k where d < 3000
		) insert into ${s_code}
			(id, a_id, b_id, ${a_metric_fields.join(', ')})
		select * from copy_rows
		`,
}));