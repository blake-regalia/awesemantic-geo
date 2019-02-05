let s_relation = process.argv[2];
let a_disjoints = process.argv.slice(3);

const H_METRICS = {
	touches: {
		where: 'st_touches(a_polygons, b_polygons)',
		selects: {
			// labels
			label_dc: {
				select: 'false',
				type: 'boolean default false',
			},
			label_ec: {
				select: 'false',
				type: 'boolean default false',
			},

			// intersecting boundary
			lib: 'st_length(ab_intersect)',
			lib_p1: 'st_length(ab_intersect) / p1',
			lib_p2: 'st_length(ab_intersect) / p2',
			lib_a1: 'st_length(ab_intersect) / a1',
			lib_a2: 'st_length(ab_intersect) / a2',
		},
	},
	overlaps: {
		where: 'st_overlaps(a_polygons, b_polygons)',
		selects: {
			// labels
			label_tpp: {
				select: 'false',
				type: 'boolean default false',
			},
			label_ntpp: {
				select: 'false',
				type: 'boolean default false',
			},
			label_po: {
				select: 'false',
				type: 'boolean default false',
			},
			label_ec: {
				select: 'false',
				type: 'boolean default false',
			},
			label_eq: {
				select: 'false',
				type: 'boolean default false',
			},

			// intersection
			ai: 'st_area(ab_intersect)',
			ai_a1: 'st_area(ab_intersect) / a1',
			ai_a2: 'st_area(ab_intersect) / a2',

			// difference
			ad: 'st_area(st_difference(a_polygons, b_polygons)::geography)',
			ad_a1: 'st_area(st_difference(a_polygons, b_polygons)::geography) / a1',
			ad_a2: 'st_area(st_difference(a_polygons, b_polygons)::geography) / a2',

			// intersecting boundary
			lib: 'st_length(st_intersection(st_boundary(a_polygons), st_boundary(b_polygons))::geography)',
			lib_p1: 'st_length(st_intersection(st_boundary(a_polygons), st_boundary(b_polygons))::geography) / p1',
			lib_p2: 'st_length(st_intersection(st_boundary(a_polygons), st_boundary(b_polygons))::geography) / p2',
		},
	},
};

const compute = require('./compute.js');
let s_code = `pg_${s_relation}_pg_dirty`;
let h_metric = H_METRICS[s_relation];
compute(s_code, h_metric, (a_metric_selects, N_LIMIT, a_metric_fields) => ({
	count: 'osm_polygons',
	inner: `
		select
			a0.id,
			a0.dbr_id,
			a0.polygons_valid
		from osm_polygons a0
	`,
	rows: N_LIMIT,
	order: 'id',
	gen: (s_select) => `
		with copy_rows as (
			select
				gen_random_uuid() id,
				case when normal then a_id
					else b_id
				end as a_id,
				case when normal then b_id
					else a_id
				end as b_id,
				${a_metric_selects.join(', ')}
			from (
				select a_id, b_id, a_polygons, b_polygons,
					case when a_area < b_area then true
						else false
					end as normal,
					least(a_area, b_area) a1,
					greatest(a_area, b_area) a2,
					least(a_perimeter, b_perimeter) p1,
					greatest(a_perimeter, b_perimeter) p2,
					st_intersection(a_polygons, b_polygons)::geography ab_intersect
				from (
					select
						a.id as a_id,
						b.id as b_id,
						a.polygons_valid a_polygons,
						b.polygons_valid b_polygons,
						st_area(a.polygons_valid::geography) a_area,
						st_area(b.polygons_valid::geography) b_area,
						st_perimeter(a.polygons_valid::geography) a_perimeter,
						st_perimeter(b.polygons_valid::geography) b_perimeter
					from ${s_select} a
						left join osm_polygons b
							on a.id < b.id
					where
						a.dbr_id != b.dbr_id
						${a_disjoints.map((s_disjoint) => `
							and (a.id, b.id) not in (
								select a_id, b_id
								from ${s_disjoint}
							)`).join('')}
				) i
				where ${h_metric.where}
			) j
		) insert into ${s_code}
			(id, a_id, b_id, ${a_metric_fields.join(', ')})
		select * from copy_rows
	`,
}));
