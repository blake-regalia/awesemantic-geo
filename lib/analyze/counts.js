const pg = require('pg');
const g_config = require('../../config.app.js');

let y_client = new pg.Client(g_config.database);

y_client.connect();

let h_cats = {
	pl: ['road', 'stream'],
	pg: ['park', 'city', 'county'],
};

let h_combos = {
	pg: {
		pg: ['touches', 'overlaps', 'tpp', 'ntpp'],
	},
	pl: {
		pg: ['crosses', 'touches', 'within'],
		pl: ['crosses'],
	},
	city: {
		city: ['broad_equals', 'broad_touches'],
		county: ['broad_equals', 'broad_touches'],
		park: ['broad_touches'],
	},
	park: {
		county: ['broad_touches'],
		park: ['broad_touches'],
	},
};

let h_codes = {
	touches: 'EC',
	overlaps: 'PO',
	tpp: 'TPP/i',
	ntpp: 'NTPP/i',
	pl_touches: 'TCH',
	crosses: 'CRS',
	within: 'INC',
};

const X_COLUMN_WIDTH = 16;

(async() => {

	for(let [s_type_left, h_rights] of Object.entries(h_combos)) {
		let a_cats_left = h_cats[s_type_left];

		for(let [s_type_right, a_rels] of Object.entries(h_rights)) {
			let as_seen = new Set();
			let a_rows = [];
			let a_cats_right = h_cats[s_type_right];

			for(let s_cat_left of a_cats_left) {
				for(let s_cat_right of a_cats_right) {
					let si_combo = (s_cat_left < s_cat_right)? `${s_cat_left} | ${s_cat_right}`: `${s_cat_right} | ${s_cat_left}`;
					// console.log(si_combo);
					if(as_seen.has(si_combo)) {
						// console.log('\tskipping');
						continue;
					}
					as_seen.add(si_combo);

					let b_pl_l = 'pl' === s_type_left;
					let b_pl_r = 'pl' === s_type_right;

					let c_total_count = 0;
					let a_avgs = [];
					let a_headers = [];
					let a_cells = [];
					for(let s_rel of a_rels) {
						let s_query = /* syntax: sql */ `
							select avg(least(qa, qb)) as avg_a,
									avg(greatest(qa, qb)) as avg_b,
									count(*) as count
								from (
									select
										st_${b_pl_l? 'length': 'area'}(a.poly${b_pl_l? 'lines': 'gons_valid'}::geography) qa,
										st_${b_pl_r? 'length': 'area'}(b.poly${b_pl_r? 'lines': 'gons_valid'}::geography) qb
									from ${s_type_left}_${s_rel}_${s_type_right} c
									left join osm_poly${b_pl_l? 'lines': 'gons'} a
										on c.a_id = a.id
									left join osm_poly${b_pl_r? 'lines': 'gons'} b
										on c.b_id = b.id
									where (
										(
											a.is_${s_cat_left} = true
											and b.is_${s_cat_right} = true
										) or (
											a.is_${s_cat_right} = true
											and b.is_${s_cat_left} = true
										)
									)
						`;

						let g_res = await y_client.query(s_query);

						a_headers.push(`\\textbf{${h_codes[s_type_left+'_'+s_rel] || h_codes[s_rel]}}`.padEnd(X_COLUMN_WIDTH, ' '));

						// console.log(`${si_combo}: ${g_res.rows[0].count}`);
						let g_result = g_res.rows[0];
						let n_count = +g_result.count;
						a_cells.push(`$${n_count.toLocaleString()}$`.padEnd(X_COLUMN_WIDTH, ' '));

						a_avgs.push({
							avg_a: n_count * g_result.avg_a,
							avg_b: n_count * g_result.avg_b,
						});

						c_total_count += n_count;
					}

					// averages
					let g_final = a_avgs.reduce((g_sum, g_avg) => ({
						left: g_sum.left + g_avg.avg_a,
						right: g_sum.right + g_avg.avg_b,
					}), {left:0, right:0});

					// left and right
					a_cells.push(`$${Math.round((g_final.left / c_total_count) / (1000 * (b_pl_l? 1: 1000)))}km${b_pl_l? '': '^2'}$`.padEnd(X_COLUMN_WIDTH, ' '));
					a_cells.push(`$${Math.round((g_final.right / c_total_count) / (1000 * (b_pl_l? 1: 1000)))}km${b_pl_r? '': '^2'}$`.padEnd(X_COLUMN_WIDTH, ' '));

					if(!a_rows.length) {
						a_headers.push(`\\textit{left poly${b_pl_l? 'line': 'gon'}}`.padEnd(X_COLUMN_WIDTH, ' '));
						a_headers.push(`\\textit{right poly${b_pl_r? 'line': 'gon'}}`.padEnd(X_COLUMN_WIDTH, ' '));
						a_rows.push(' '.padEnd(14, ' ')+` & ${a_headers.join(' & ')} \\\\ \\hline`);
					}

					a_rows.push(`${s_cat_left}-${s_cat_right}`.padEnd(14, ' ')+` & ${a_cells.join(' & ')} \\\\ \\hline`);
				}
			}

			console.log(`
\\begin{table}[]
	\\begin{tabular}
		${a_rows.join('\n\t\t')}
	\\end{tabular}
\\end{table}
			`);
		}
	}

	y_client.end();

})();
