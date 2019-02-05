let s_relation = process.argv[2];
let s_subset = process.argv[3];
let a_disjoints = process.argv.slice(4);
let s_code = `pl_${s_relation}_pl_dirty`;

const X_EPSILON = 20;

const H_METRICS = {
	runs_along: {
		where: /* syntax: sql */ `
			st_intersects(a_buffer, b_buffer)
		`,
		selects: {
			// area of intersecting boundaries
			aib: 'st_area(i_buffer::geography)',

			// smaller/larger buffer radius
			rn: 'rn',
			rx: 'greatest(r1, r2)',

			// length of shorter/greater polyline
			ln: 'ln',
			lx: 'greatest(l1, l2)',

			// length of short polyline over (2 * larger buffer radius)
			lnrx: 'ln / (2 * greatest(r1, r2))',

			// areas
			c: 'st_area(i_buffer::geography) / (rn ^ 2)',
		},
	},
};


const S_BUFFER_STYLE = 'quad_segs=2 endcap=square join=mitre';

let h_metric = H_METRICS[s_relation];
const compute = require('./compute.js');
compute(s_code, h_metric, (a_metric_selects, N_LIMIT, a_metric_fields) => ({
	count: 'osm_polylines',
	debug: true,
	inner: `
		select
			id a_id,
			dbr_id a_dbr_id,
			buffer_radius r1,
			polylines_buffered a_buffer,
			st_length(a0.polylines::geography) l1

		from osm_polylines a0
		where a0.id in (select a_id from ${s_subset} c)
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
					st_intersection(a_buffer, b_buffer) i_buffer,
					least(l1, l2) ln,
					least(r1, r2) rn

				from (
					select
						i.*,
						b.buffer_radius r2,
						b.polylines_buffered b_buffer,
						st_length(b.polylines::geography) l2

					from (
						select
							a1.*,
							c.b_id as b_id

						from ${s_select} a1
						inner join ${s_subset} c
							on c.a_id = a1.a_id
					) i

					left join osm_polylines b
						on i.b_id = b.id

					where
						i.a_dbr_id != b.dbr_id
						${a_disjoints.map((s_disjoint) => `
							and (i.a_id, b.id) not in (
								select a_id, b_id
								from ${s_disjoint}
							)`).join('')}
				) j
			) k
			where ${h_metric.where}
		) insert into ${s_code}
			(id, a_id, b_id, ${a_metric_fields.join(', ')})
		select * from copy_rows
	`,
}));

