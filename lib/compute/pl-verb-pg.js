let s_relation = process.argv[2];
let a_disjoints = process.argv.slice(3);
let s_code = `pl_${s_relation}_pg_dirty`;

const H_METRICS = {
	touches: {
		where: 'st_touches(a_polylines, b_polygons)',
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
		},
	},
	crosses: {
		where: 'st_crosses(a_polylines, b_polygons)',
		selects: {
			// intersection
			li: 'st_length(ab_intersect)',
			li_p1: 'st_length(ab_intersect) / p1',
			li_p2: 'st_length(ab_intersect) / p2',

			// difference
			ld: 'st_length(st_difference(a_polylines, b_polygons)::geography)',
			ld_p1: 'st_length(st_difference(a_polylines, b_polygons)::geography) / p1',
			ld_p2: 'st_length(st_difference(a_polylines, b_polygons)::geography) / p2',

			// geographic distance between polygon centroid and intersecting polyline's closest point to its own centroid
			dc_ic_a: 'st_distance(st_centroid(b_polygons::geography, true), ab_closest, true) / st_area(b_polygons)',

			// area of split ratio
			asr: 'least(aab_split_0, aab_split_1) / greatest(aab_split_0, aab_split_1)',
		},
	},
};

let h_metric = H_METRICS[s_relation];
const compute = require('./compute.js');
compute(s_code, h_metric, (a_metric_selects, N_LIMIT, a_metric_fields) => ({
	count: 'osm_polylines',
	inner: `
		select
			a0.id,
			case when a0.polylines_sewn is not null
				then a0.polylines_sewn
				else a0.polylines
			end polylines,
			a0.polylines_sewn,
			st_length(a0.polylines::geography) p1
		from osm_polylines a0
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
				select *,
					${'crosses' === s_relation
						? `
							case when ab_split is not null
								then st_area(st_geometryN(ab_split, 1))
								else -1
							end as aab_split_0,
							case when ab_split is not null
								then st_area(st_geometryN(ab_split, 2))
								else 1
							end as aab_split_1,
						`: ''}
					st_closestPoint(i.ab_intersect::geometry, st_centroid(i.ab_intersect::geometry))::geography ab_closest
				from (
					select
						a.id as a_id,
						b.id as b_id,
						a.polylines a_polylines,
						b.polygons_valid b_polygons,
						a.p1,
						st_perimeter(b.polygons_valid::geography) p2,
						${'crosses' === s_relation
							? `
								case when a.polylines_sewn is not null
									then st_split(b.polygons_valid, a.polylines_sewn)
									else null
								end as ab_split,
							`
							: ''}
						st_intersection(a.polylines, b.polygons_valid)::geography ab_intersect
					from ${s_select} a cross join osm_polygons b
					where true
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
