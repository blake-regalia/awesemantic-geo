/* eslint-env browser */

const $ = require('jquery-browserify');
const request = require('browser-request');
const L = require('leaflet');
const wkt_parse = require('wellknown');
const d3 = require('d3');
//const wkx = require('wkx');
//const Buffer = require('buffer').Buffer;

const P_POSTGRES = '/pg';

function query(s_sql, fk_query) {
	request.post({
		url: P_POSTGRES,
		form: {
			query: s_sql,
		},
	}, (e_req, d_res, s_body) => {
		let h_res = JSON.parse(s_body);

		if(h_res.error) console.error(h_res.error);
		else {
			fk_query(h_res.result);
		}
	});
}


let y_map;


// init leaflet
(() => {
	let p_icons = L.Icon.Default.imagePath = '/resource/leaflet-images';

	// size map
	var h_size = {
		sml: '12',
		med: '18',
		lrg: '24',
	};

	// helper function
	var icon = function(s_name, a_dim, a_anchor) {
		if(!a_anchor) a_anchor = [Math.floor(a_dim[0]*0.5), Math.floor(a_dim[1]*0.5)];
		return (function(s_size) {
			let n_size = (s_size && h_size[s_size]) || '24';
			var p_icon = p_icons+this.name+'-'+n_size;
			return new L.Icon({
				iconUrl: p_icon+'.png',
				iconRetinaUrl: p_icon+'@2x.png',
				iconSize: this.dim,
				iconAnchor: this.anchor,
				color: '#ff0',
			});
		}).bind({name: s_name, dim: a_dim, anchor: a_anchor});
	};

	// icon table
	L.Icons = {
		Cross: icon('cross', [11, 11]),
		Tick: function(s_color) {
			return new L.DivIcon({
				className: 'Ldi-cross med',
				html: '<div style="color:'+s_color+';">&#735;</div>',
			});
		},
		Dot: function(s_color) {
			return new L.DivIcon({
				className: 'Ldi-dot med',
				html: '<div style="color:'+s_color+';">&#8226;</div>',
				popupAnchor: [0, -3],
			});
		},
	};
})();


const A_COLORS = [
	{
		color: '#ff0000',
		fillColor: '#ff0000',
	},
	{
		color: '#0000ff',
		fillColor: '#0000ff',
	},
].reverse();
let i_color = 0;

let a_map_layers = [];
let a_geoms = [];
function show_wkt(a_wkts, i_bounds) {
	let q_map = $('#map').css('visibility', 'visible');

	if(!y_map) {
		y_map = L.map(q_map.get(0));

		// L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
		L.tileLayer('http://{s}.tile.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey=af36210de0934f6d827f7642c93c9c03', {
			maxNativeZoom: 21,
			maxZoom: 14,
			detectRetina: true,
		}).addTo(y_map);
	}

	a_map_layers.forEach((y) => {
		y_map.removeLayer(y);
	});
	a_map_layers.length = 0;

	let y_bounds = L.latLngBounds([0, 0, 0, 0]);
	a_wkts.reverse().forEach((s_wkt, i_wkt) => {
		// debugger;
		// let sx_wkb = atob(s_wkb);
		// let ab_wkb = new Buffer(sx_wkb);
		// let y_geom = wkx.Geometry.parse(ab_wkb);
		// let h_geojson = y_geom.toGeoJSON();
		let h_geojson = wkt_parse(s_wkt);
		let y_geojson = L.geoJson(h_geojson);
		let h_color = A_COLORS[i_color];
		i_color = (i_color + 1) % A_COLORS.length;
		y_geojson.setStyle({
			color: h_color.color,
			fillColor: h_color.fillColor,
		});
		y_geojson.addTo(y_map);
		a_map_layers.push(y_geojson);
		if('undefined' === typeof i_bounds || i_wkt === i_bounds) {
			y_bounds.extend(y_geojson.getBounds());
		}
	});

	y_map.fitBounds(y_bounds.pad(1.25));
}

// parse querystring params
let h_query = {};
location.search.substr(location.search.indexOf('?')+1).split('&').forEach(s => {
	let [s_key, s_value] = s.split('=');
	h_query[s_key] = s_value;
});

let x_min = h_query.min? +h_query.min: undefined;
let x_max = h_query.max? +h_query.max: undefined;

let tbl_polygon = (s_side) => ({
	table: 'osm_polygons',
	geom: `${s_side}.polygons_valid`,
});

let tbl_polyline = (s_side) => ({
	table: 'osm_polylines',
	geom: `${s_side}.polylines`,
});

//
let s_relation = location.pathname? location.pathname.substr(1): 'overlaps';
const H_RELATIONS = {
	pg_overlaps_pg: {
		left: tbl_polygon('a'),
		right: tbl_polygon('b'),
		labels: ['tpp', 'ntpp', 'po', 'ec', 'eq'],
		fields: {
			ad_a1: {
				title: 'area of difference / area of smaller polygon',
				apply: a => a.filter(x => x >= ('undefined' !== typeof x_min? x_min: 0.02) && x <= (x_max || 0.98)),
			},
			ad: {
				title: 'area of difference',
			},
			ad_a2: {
				title: 'area of difference / area of smaller polygon',
			},
			ai: {},
			ai_a1: {},
			ai_a2: {},
			lib: {},
			lib_p1: {},
			lib_p2: {},
		},
	},
	pg_disjoint_pg: {
		left: tbl_polygon('a'),
		right: tbl_polygon('b'),
		labels: ['ec', 'dc'],
		fields: {
			d: {
				title: 'minimum distance',
				apply: a => a.filter(x => x >= ('undefined' !== typeof x_min? x_min: 0) && x <= (x_max || Infinity)),
			},
		},
	},
	pg_touches_pg: {
		left: tbl_polygon('a'),
		right: tbl_polygon('b'),
		labels: [],
		fields: {
			lib: {
				title: 'length of intersecting boundary',
			},
			lib_p1: {},
			lib_p2: {},
			lib_a1: {},
			lib_a2: {},
		},
	},
	pg_ntpp_pg: {
		left: tbl_polygon('a'),
		right: tbl_polygon('b'),
		labels: [],
		fields: {
			ddb: {},
			ddb_p1: {},
			ddb_p2: {},
		},
	},
	pg_tpp_pg: {
		left: tbl_polygon('a'),
		right: tbl_polygon('b'),
		labels: [],
		fields: {
			lib: {},
			lib_p1: {},
			lib_p2: {},
		},
	},
	pl_disjoint_pg: {
		left: tbl_polyline('a'),
		right: tbl_polygon('b'),
		labels: ['ec', 'dc'],
		fields: {
			d: {
				title: 'minimum distance',
				apply: a => a.filter(x => x >= ('undefined' !== typeof x_min? x_min: 0) && x <= (x_max || Infinity)),
			},
			d_sra1: {
				title: 'distance / square root of polygon area',
				apply: a => a.filter(x => x >= ('undefined' !== typeof x_min? x_min: 0) && x <= (x_max || Infinity)),
			},
		},
	},
	pl_touches_pg: {
		left: tbl_polyline('a'),
		right: tbl_polygon('b'),
		labels: ['ec', 'dc'],
		fields: {
			lib: {},
			lib_p1: {},
			lib_p2: {},
		},
	},
	pl_crosses_pg: {
		left: tbl_polyline('a'),
		right: tbl_polygon('b'),
		labels: [],
		fields: {
			li: {},
			li_p1: {},
			li_p2: {},
			ld: {},
			ld_p1: {},
			ld_p2: {},
		},
	},
	pl_runs_along_pl: {
		left: tbl_polyline('a'),
		right: tbl_polyline('b'),
		where: 'ln > 300 and lnrx > 10', // c > 2
		labels: [],
		fields: {
			aib: {},
			a0: {},
			lnrx: {},
			rn: {},
			rx: {},
			lsn: {},
			c: {},
		},
	},
	pl_connects_pl: {
		left: tbl_polyline('a'),
		right: tbl_polyline('b'),
		labels: [],
		fields: {
			nd: {},
		},
	},
};


let h_relation = H_RELATIONS[s_relation];
let s_field = h_query.field? h_query.field: Object.keys(h_relation.fields)[0];
let h_field = h_relation.fields[s_field];
let a_labels = h_relation.labels;
let s_sort = h_query.sort;
let s_limit = h_query.limit;

let a_rows = [];
let a_bins = [];


function update_hash() {
	let a_ids = location.hash.substr(1).split(';');
	let x_a_id = ~~a_ids[0];
	let x_b_id = ~~a_ids[1];
	let h_row = a_rows.find((h) => {
		return h.a_id === x_a_id && h.b_id === x_b_id;
	});
	if(!h_row) {
		console.error(`no such combo: ${x_a_id} / ${x_b_id}`);
		return
	}
	a_bins.some((a_range) => {
		let x_test = h_row[s_field];
		if(a_range.x0 <= x_test && a_range.x1 >= x_test) {
			inspect_histogram_range(a_range);
			let i_row = a_range.indexOf(x_test);
			$('.row').eq(i_row).click();
			return true;
		}
	});
}

window.onhashchange = update_hash;

let s_table = `${s_relation}_dirty`;
query(`
	select
		c.a_id, c.b_id,
		c.${s_field},
		${'pg_overlaps_pg' === s_relation && false? 'a.in_multiple_counties,': ''}
		${a_labels.map(s => 'c.label_'+s+', ').join('')}
		a.dbr_id a_dbr_id,
		b.dbr_id b_dbr_id,
		st_astext(${h_relation.left.geom}) as a_geom,
		st_astext(${h_relation.right.geom}) as b_geom
	from ${s_table} c
	left join ${h_relation.left.table} a on c.a_id = a.id
	left join ${h_relation.right.table} b on c.b_id = b.id
	where true
		${h_relation.where? `and ${h_relation.where}`: ''}
		${'undefined' !== typeof x_min? `and c.${s_field} >= ${x_min}`: ''}
		${'undefined' !== typeof x_max? `and c.${s_field} <= ${x_max}`: ''}
	order by c.${s_field} ${s_sort || 'asc'}
	${s_limit? `limit ${s_limit}`: ''}
`, (h_result) => {
	a_rows = h_result.rows.filter(g => g.a_dbr_id && g.b_dbr_id && g.a_geom && g.b_geom);

	let h_data = {};
	// for(let s_field in h_fields) {
	h_data[s_field] = a_rows.map(h => h[s_field]);
	// }

	let a_data = h_data[s_field];
	let n_bins = h_query.bins? ~~h_query.bins: Math.max(10, Math.ceil(Math.sqrt(h_result.rowCount)));

	a_bins = draw_hist(a_data, n_bins);

	if(location.hash) {
		update_hash();
	}
});

$('h1').click(() => {
	$('#histogram').show();
	$('#map').hide();
	$('#inspect').hide();
});

function draw_hist(a_data, n_bins) {
	if(h_field.apply) a_data = h_field.apply(a_data);
	$('h1').text(s_relation+';  '+s_field+(s_field? ' = ('+h_field.title+')': ''));
	let svg = d3.select('#histogram');

	let h_margin = {top: 10, right: 30, bottom: 30, left: 30};
	let x_width = +svg.attr('width') - h_margin.left - h_margin.right;
	let x_height = +svg.attr('height') - h_margin.top - h_margin.bottom;

	let g = svg.append('g')
		.attr('transform', `translate(${h_margin.left}, ${h_margin.top})`);

	let a_x_domain = ['undefined' !== typeof x_min? x_min: d3.min(a_data), x_max || d3.max(a_data)];
	let x = d3.scaleLinear()
		.domain(a_x_domain)
		.range([0, x_width]);
		// .rangeRound([0, x_width]);

	let a_bins = d3.histogram()
		.domain(x.domain())
		.thresholds(x.ticks(n_bins))(a_data);

	let y = d3.scaleLinear()
		.domain([0, d3.max(a_bins, d => d.length)])
		.range([x_height, 0]);

	let bar = g.selectAll('.bar')
		.data(a_bins)
		.enter().append('g')
			.attr('class', 'bar')
			.attr('transform', d => `translate(${x(d.x0)}, ${y(d.length)})`);

	bar.append('rect')
		.attr('x', 1)
		.attr('width', x(a_bins[0].x1) - x(a_bins[0].x0) - 1)
		.attr('height', d => x_height - y(d.length))
		.on('click', (a_samples) => {
			inspect_histogram_range(a_samples);
		});

	let f_format = d3.format(',.0f');
	bar.append('text')
		.attr('dy', '.75em')
		.attr('y', 6)
		.attr('x', (x(a_bins[0].x1) - x(a_bins[0].x0)) / 2)
		.attr('text-anchor', 'middle')
		.text(d => f_format(d.length));

	g.append('g')
		.attr('class', 'axis axis--x')
		.attr('transform', `translate(0, ${x_height})`)
		.call(d3.axisBottom(x));

	return a_bins;
}

function inspect_histogram_range(a_samples) {
	$('#histogram').hide();
	$('#map').show();
	let a_source = a_rows.filter(h => a_samples.includes(h[s_field]));

	let q_inspect = $('#inspect').empty().show();
	a_source.forEach(h => {
		let q_row = $(`<div class="row${h.in_multiple_counties? ' in_multiple_counties': ''}"></div>`);
		q_row.append(`<span>${h[s_field].toFixed(4)}</span>`);
		a_labels.forEach((s_label) => {
			$(`<span class="label-flag ${s_label} is_${h['label_'+s_label]}" data-code="${s_label}"></span`)
			.click(function(e) {
				let q_this = $(this);
				let s_code = q_this.attr('data-code');
				if(q_this.is('.is_false')) {
					q_this.removeClass('is_false').addClass('is_pending');
					query(`update ${s_table} set label_${s_code} = true
						where a_id=${h.a_id} and b_id=${h.b_id}`, (h_result) => {
						if(!h_result.error && h_result.rowCount) {
							q_this.removeClass('is_pending').addClass('is_true');
						}
					});
				}
				else {
					q_this.removeClass('is_true').addClass('is_pending');
					query(`update ${s_table} set label_${s_code} = false
						where a_id=${h.a_id} and b_id=${h.b_id}`, (h_result) => {
						if(!h_result.error && h_result.rowCount) {
							q_this.removeClass('is_pending').addClass('is_false');
						}
					});
				}
				e.stopPropagation();
			}).appendTo(q_row);
		});

		let s_a_dbr_id_text = h.a_dbr_id;
		if(s_a_dbr_id_text.length > 28) s_a_dbr_id_text = s_a_dbr_id_text.substr(0, 25)+'...';
		let s_b_dbr_id_text = h.b_dbr_id;
		if(s_b_dbr_id_text.length > 28) s_b_dbr_id_text = s_b_dbr_id_text.substr(0, 25)+'...';
		q_row.append(`<a href="http://dbpedia.org/page/${h.a_dbr_id}">${s_a_dbr_id_text}</a>`);
		q_row.append(`<a href="http://dbpedia.org/page/${h.b_dbr_id}">${s_b_dbr_id_text}</a>`);
		q_row.on('click', () => {
			$('.selected').removeClass('selected');
			q_row.addClass('selected');
			show_wkt([h.a_geom, h.b_geom], 0);
			location.hash = h.a_id+';'+h.b_id;
		});
		q_inspect.append(q_row);
	});
}
