let s_relation = process.argv[2];
let s_subset = process.argv[3];
let a_disjoints = process.argv.slice(4);
let s_code = `pl_${s_relation}_pl_dirty`;

const X_EPSILON = 100;

const H_METRICS = {
	crosses: {
		where: 'st_crosses(a_polylines, b_polylines)',
		selects: {
			// intersection
			li: 'st_length(st_intersection(a_polylines, b_polylines)::geography)',
		},
	},
	connects: {
		geometry: 'polylines_sewn',
		// where: /* syntax: sql */ `
		// 	st_distance(st_startPoint(a_polyline_0)::geography, b_polyline_0::geography) < ${X_EPSILON}
		// 	or st_distance(st_endPoint(a_polyline_0)::geography, b_polyline_0::geography) < ${X_EPSILON}
		// 	or st_distance(a_polyline_0::geography, st_startPoint(b_polyline_0)::geography) < ${X_EPSILON}
		// 	or st_distance(a_polyline_0::geography, st_endPoint(b_polyline_0)::geography) < ${X_EPSILON}
		// `,
		where: /* syntax: sql */ `
			st_distance(st_startPoint(a_polylines)::geography, b_polylines::geography) <= ra
			or st_distance(st_endPoint(a_polylines)::geography, b_polylines::geography) <= ra
			or st_distance(a_polylines::geography, st_startPoint(b_polylines)::geography) <= rb
			or st_distance(a_polylines::geography, st_endPoint(b_polylines)::geography) <= rb
		`,
		selects: {
			// length of shorter polyline
			ln: 'least(p1, p2)',
			lx: 'greatest(p1, p2)',

			// minimum distance
			nd: /* syntax: sql */ `
				least(
					st_distance(st_startPoint(a_polylines)::geography, b_polylines::geography),
					st_distance(st_endPoint(a_polylines)::geography, b_polylines::geography),
					st_distance(a_polylines::geography, st_startPoint(b_polylines)::geography),
					st_distance(a_polylines::geography, st_endPoint(b_polylines)::geography)
				)
			`,
		},
	},
};


const buffer_radius_polyline = (s_geom) => `
	1000 * ln(2 * st_length(
		st_longestLine(st_centroid(${s_geom}), ${s_geom})::geography
	))
`;

let h_metric = H_METRICS[s_relation];
let s_geom = h_metric.geometry || 'polylines';
const compute = require('./compute.js');
compute(s_code, h_metric, (a_metric_selects, N_LIMIT, a_metric_fields) => ({
	count: 'osm_polylines',
	inner: `
		select
			a0.id,
			a0.dbr_id,

			${'connects' === s_relation
				?
				`${buffer_radius_polyline(`a0.${s_geom}`)} ra,`
				: ''}

			a0.${s_geom},
			st_length(a0.${s_geom}::geography) p1

		from osm_polylines a0
		where a0.${s_geom} is not null
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
				select *
				from (
					select
						a.id as a_id,
						b.id as b_id,
						a.${s_geom} a_polylines,
						b.${s_geom} b_polylines,

						${'connects' === s_relation
							? `
								a.ra,
								${buffer_radius_polyline(`b.${s_geom}`)} rb,
							`: ''}

						a.p1,
						st_length(b.${s_geom}::geography) p2
					from ${s_select} a
					left join osm_polylines b
						on a.id < b.id
					where
						a.dbr_id != b.dbr_id
						and b.${s_geom} is not null
						${s_subset && 'null' !== s_subset
							? `
								and (a.id, b.id) in (
									select a_id, b_id
									from ${s_subset}
								)
							`
							: ''}
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

