let s_code = 'pg_disjoint_pg_dirty';

let h_metric = {
	selects: {
		// distance
		d: 'd',
		d_p1: 'd / p1',
		d_p2: 'd / p2',

		// // distance of centroids
		// dc: 'st_distance(st_centroid(a_polygons)::geography, st_centroid(b_polygons)::geography, true)',

		// // distance of furthest points
		// df: 'st_length(st_longestline(a_polygons, b_polygons)::geography, true)',
	},
};

const compute = require('./compute.js');
compute(s_code, h_metric, (a_metric_selects, N_LIMIT) => ({
	count: 'osm_polygons',
	inner: `
		select
			a0.id,
			a0.dbr_id,
			a0.polygons_valid,
			st_perimeter(a0.polygons_valid::geography) a_perimeter,
			st_buffer(st_envelope(a0.polygons_valid), 0.08, 'join=mitre') as bbb
		from osm_polygons a0
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
				select a_id, b_id, a_polygons, b_polygons,
					least(a_perimeter, b_perimeter) p1,
					greatest(a_perimeter, b_perimeter) p2,
					st_distance(a_polygons::geography, b_polygons::geography, true) d
				from (
					select a_id, b_id, a_polygons, b_polygons,
						a_perimeter,
						st_perimeter(b_polygons::geography) b_perimeter
					from (
						select
							a.id a_id, b.id b_id,
							a.polygons_valid a_polygons,
							b.polygons_valid b_polygons,
							a_perimeter
						from ${s_select} a left join osm_polygons b
						on a.id < b.id
						where bbb && b.polygons_valid
							and a.dbr_id != b.dbr_id
					) i
					where st_disjoint(a_polygons, b_polygons)
				) j
			) k where d < 4000
		) insert into ${s_code}
		select * from copy_rows
		`,
}));
