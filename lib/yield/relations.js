const fs = require('fs');
const graphy = require('graphy-dev');
const pj = require('../util/pj');

const h_pg_config = require('../../database');
const db = pj(h_pg_config);


const P_IRI_DBR = 'http://dbpedia.org/resource/';

const P_IRI_AGT = 'http://awesemantic-geo.link/topology/';
const H_AGT = {
	broadlyTouches: {
		table: (a, r, b) => `${a}_broad_touches_${b}`,
	},
	broadlyEquals: {
		table: (a, r, b) => `${a}_broad_equals_${b}`,
	},
	broadlyTPP: {
		table: (a, r, b) => `${a}_broad_tpp_${b}`,
	},
	mostlyInside: {
		table: (a, r, b) => `${a}_overlaps_${b}`,
		mod: (a, b) => `
			left join ${a}_overlaps_${b}_dirty x
				on c.z_id = x.id
			where x.ai_a1 > 0.8
		`,
	},
	// merelyInside: {
	// 	table: (a, r, b) => `${a}_overlaps_${b}`,
	// 	mod: (a, b) => `
	// 		left join ${a}_overlaps_${b}_dirty x
	// 			on c.z_id = x.id
	// 		where x.ai_a1 <= 0.8
	// 	`,
	// },

	barelyTouches: {
		table: (a, r, b) => `${a}_touches_${b}`,
		mod: (a, b) => `
			left join ${a}_touches_${b}_dirty x
				on c.z_id = x.id
			where x.lib < 10
		`,
	},
};

let s_src = process.argv[2];
let s_relation = process.argv[3];
let s_dest = process.argv[4];

let h_agt = H_AGT[s_relation];
let kr_relation = graphy.namedNode(P_IRI_AGT+s_relation);

let s_file = `${s_src}_${s_relation}_${s_dest}`;
let ds_write = graphy.content.ttl.write({
	prefixes: require(__dirname+'/../../config.app.js').prefixes,
});

ds_write.pipe(fs.createWriteStream(__dirname+'/../../data/triples/'+s_file+'.ttl'));

// let ds_out = fs.createWriteStream(__dirname+'/../../data/triples/'+s_file+'.nt');
// ds_out.write('@prefix agt: <http://awesemantic-geo.link/topology/> .\n\n');

let H_DEFAULT_GRAPH = graphy.defaultGraph();
let s_table = process.argv[5] || `${s_src}_${s_relation}_${s_dest}`;
if(h_agt && h_agt.table) s_table = h_agt.table(s_src, s_relation, s_dest);
let c_relations = 0;

let root_table = (s_label) => {
	switch(s_label) {
		case 'pl':
		case 'stream':
		case 'road': {
			return 'osm_polylines';
		}

		default: {
			return 'osm_polygons';
		}
	}
};

let s_src_left = root_table(s_src);
let s_src_right = root_table(s_dest);

db.from(`${s_table} c
	left join ${s_src_left} a on a.id = c.a_id
	left join ${s_src_right} b on b.id = c.b_id
	`+((h_agt && h_agt.mod && h_agt.mod(s_src, s_dest)) || '')+`
`).select('a.dbr_id a_dbr_id, b.dbr_id b_dbr_id')
.each((h_row) => {

	ds_write.write({
		type: 'c3',
		value: {
			['dbr:'+h_row.a_dbr_id]: {
				['agt:'+s_relation]: 'dbr:'+h_row.b_dbr_id,
			},
		},
	});

	// let kn_a = graphy.namedNode(P_IRI_DBR+h_row.a_dbr_id);
	// let kn_b = graphy.namedNode(P_IRI_DBR+h_row.b_dbr_id);

	// // relation a -> b
	// ds_out.write(kn_a.toCanonical()+' agt:'+s_relation+' '+kn_b.toCanonical()+' .\n');
	c_relations += 1;
}, (y_pool) => {
	console.log(`${c_relations} ${s_src} ${s_relation} ${s_dest}`);
	ds_write.end();
	y_pool.end();
});
