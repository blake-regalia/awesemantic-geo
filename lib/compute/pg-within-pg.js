let s_relation = process.argv[2];
let a_disjoints = process.argv.slice(3);

const H_METRICS = {
	tpp: {
		where: "st_relate(a_polygons, b_polygons, 'TFFTTFTTT')",
		selects: {
			// intersecting boundary
			lib: 'st_length(st_intersection(st_boundary(a_polygons), st_boundary(b_polygons))::geography)',
			lib_p1: 'st_length(st_intersection(st_boundary(a_polygons), st_boundary(b_polygons))::geography) / p1',
			lib_p2: 'st_length(st_intersection(st_boundary(a_polygons), st_boundary(b_polygons))::geography) / p2',
		},
	},
	ntpp: {
		where: "st_relate(a_polygons, b_polygons, 'TFFTFFTTT')",
		selects: {
			// distance of disjoint boundaries
			ddb: 'st_distance(st_boundary(a_polygons)::geography, st_boundary(b_polygons)::geography)',
			ddb_p1: 'st_distance(st_boundary(a_polygons)::geography, st_boundary(b_polygons)::geography) / p1',
			ddb_p2: 'st_distance(st_boundary(a_polygons)::geography, st_boundary(b_polygons)::geography) / p2',
		},
	},
	equals: {
		where: 'st_equal(a_polygons, b_polygons)',
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
				a_id,
				b_id,
				${a_metric_selects.join(', ')}
			from (
				select a_id, b_id, a_polygons, b_polygons,
					case when a_perimeter < b_perimeter then true
						else false
					end as normal,
					least(a_perimeter, b_perimeter) p1,
					greatest(a_perimeter, b_perimeter) p2
				from (
					select
						a.id as a_id,
						b.id as b_id,
						a.polygons_valid as a_polygons,
						b.polygons_valid as b_polygons,
						st_perimeter(a.polygons_valid::geography) a_perimeter,
						st_perimeter(b.polygons_valid::geography) b_perimeter
					from ${s_select} a left join osm_polygons b
					on st_area(a.polygons_valid) < st_area(b.polygons_valid)
					where a.polygons_valid && b.polygons_valid
						and st_within(a.polygons_valid, b.polygons_valid)
						and a.dbr_id != b.dbr_id
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
