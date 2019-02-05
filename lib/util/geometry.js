
//
const local = require('classer').logger('geometry');

// relation members to excude
const A_RELATION_MEMBER_EXCEPTIONS = ['node', 'role'];

const A_POLYGON_RELATION_TYPES = ['boundary', 'multipolygon'];

//
const R_ROLE_INNER = /^\s*in+er+\s*$/i;
const R_ROLE_OUTER = /^\s*out+er+\s*$/i;
const R_ROLE_IGNORE = /^\s*(admin_centre|seat|disputed|yes|role)\s*$/i;


const X_EPSILON = 1e-5;  // ~1 m

/**
* helpers:
**/

// test if two points match
const points_match = (h_a, h_b) => {
	return (h_a.lat === h_b.lat) && (h_a.lon === h_b.lon);
};

// tests if series of coordinates forms closed ring
const is_closed = (a_ring) => {
	return points_match(a_ring[0], a_ring[a_ring.length-1]);
};

// almost a closed ring
const almost_closed = (a_ring) => {
	let g_first = a_ring[0];
	let g_last = a_ring[a_ring.length-1];

	return (Math.abs(g_first.lat - g_last.lat) <= X_EPSILON)
		&& (Math.abs(g_first.lon - g_last.lon) <= X_EPSILON);
};

// closes a ring
const mk_closed = a_ring => [...a_ring, a_ring[0]];


//
const as_polyline_contents = (a_points) => {
	return a_points.map((h_point) => {
		return `${h_point.lon} ${h_point.lat}`;
	}).join(',');
};

//
const as_polygon_contents = (a_outer_ring, a_inner_rings=[]) => {
	return `(${as_polyline_contents(a_outer_ring)})`
		+`${a_inner_rings.map((a_ring) => {
			return `,(${as_polyline_contents(a_ring)})`;
		}).join('')}`;
};

// creates wkt from list of points
const as_linestring = (a_points) => {
	return as_geom(`LINESTRING(${as_polyline_contents(a_points)})`);
};

// create wkt from list of polylines
const as_multipolyline = (a_polylines) => {
	return as_geom(`MULTILINESTRING(${a_polylines.map((h_polyline) => {
		return `(${as_polyline_contents(h_polyline)})`;
	}).join(',')})`);
};

// creates wkt from outer ring and list of inner rings
const as_polygon = (a_outer_ring, a_inner_rings) => {
	return as_geom(`POLYGON(${as_polygon_contents(a_outer_ring, a_inner_rings)})`);
};

// creates wkt from a list of polygons
const as_multipolygon = (a_polygons) => {
	return as_geom(`MULTIPOLYGON(${a_polygons.map((h_polygon) => {
		return `(${as_polygon_contents(h_polygon.outer_ring, h_polygon.inner_rings)})`;
	}).join(',')})`);
};

// wrap wkt in geom constructor as raw sql builder
const as_geom = (s_wkt) => {
	return () => `ST_GeomFromText('${s_wkt}', 4326)`;
};

// constructs shell out of a list of points
const mk_shell = (a_points) => {
	// not enough points to make a polygon
	if(a_points.length < 4) return false;

	// don't force-close unclosed polygons
	
	// // don't even consider polygon if it has less than 3 points to begin with
	// if(a_points.length < 3) return false;

	// not closed polygon
	if(!is_closed(a_points)) {
		// almost closed; snap close ring
		if(almost_closed(a_points)) {
			return mk_closed(a_points);
		}

		// do not create polygon
		return false;
	}

	// return cleaned up points
	return a_points;
};

// constructs rings out of a list of unordered ways
const mk_rings = (a_unassigned_ways, a_extra_ways, b_outer) => {
	// no ways, no processing
	if(!a_unassigned_ways.length) {
		// actually, outer side
		if(b_outer) {
			// extras are empty too; give up
			if(!a_extra_ways.length) return false;

			// move extras to unassigned, try with those
			a_unassigned_ways = a_extra_ways.splice(0);
		}
		// inner
		else {
			return [];
		}
	}

	//
	let a_current_ring = [];
	let a_rings = [a_current_ring];

	// finds a way in given set that starts or ends with the given node
	const find_way = (h_node, a_ways) => {
		// prep defaults
		let i_found = -1;
		let b_endpoint;

		// search for way matching given node
		a_ways.some((a_way, i_way) => {
			if(points_match(h_node, a_way[0])) {
				i_found = i_way;
				b_endpoint = false;
				return true;
			}
			else if(points_match(h_node, a_way[a_way.length-1])) {
				i_found = i_way;
				b_endpoint = true;
				return true;
			}
			return false;
		});

		// return as array
		return [i_found, b_endpoint];
	};

	// find outer way
	const find_outer_way = (h_node) => {
		return find_way(h_node, a_unassigned_ways);
	};

	// finds extra way
	const find_extra_way = (h_node) => {
		return find_way(h_node, a_extra_ways);
	};


	// removes way from unassigned outer ways at given index
	const extract_outer_way = (i_way) => {
		return a_unassigned_ways.splice(i_way, 1)[0];
	};

	// removes way from unassigned extra ways at given index
	const extract_extra_way = (i_way) => {
		return a_extra_ways.splice(i_way, 1)[0];
	};


	try {
		// start with first way to create ring
		a_current_ring.push(...extract_outer_way(0));

		// assign rings
		while(true) {
			// ring is closed
			let b_closed = is_closed(a_current_ring);

			// not closed but almost closed, make it closed
			if(!b_closed && almost_closed(a_current_ring)) {
				b_closed = true;
				a_current_ring = mk_closed(a_current_ring);
			}

			// if the current ring is closed
			if(b_closed) {

				// (assume the current ring is valid geometry; we cannot check this here)

				// if there are unassigned ways left
				if(a_unassigned_ways.length) {
					// create new ring
					a_current_ring = [];
					a_rings.push(a_current_ring);

					// take the first way from remaining unassigned
					a_current_ring.push(...extract_outer_way(0));
				}
				// no unassigned ways left
				else {
					// ring assignment succeeded; exit loop
					break;
				}
			}
			// current ring is not closed
			else {
				// ref linestring end point
				let h_ends = a_current_ring[a_current_ring.length-1];

				// take current ring's end node and look for an unassigned way that starts with this node
				let [i_next_way, b_endpoint] = find_outer_way(h_ends);

				// nothing was found on that side
				if(-1 === i_next_way) {
					// ref linestring start point
					let h_starts = a_current_ring[0];

					// try the other side of the way's linestring
					[i_next_way, b_endpoint] = find_outer_way(h_starts);

					// still, nothing was found
					if(-1 === i_next_way) {
						// try start point against extras
						[i_next_way, b_endpoint] = find_extra_way(h_ends);

						// no match
						if(-1 === i_next_way) {
							// try end point against extras
							[i_next_way, b_endpoint] = find_extra_way(h_starts);

							// still, nothing was found
							if(-1 === i_next_way) {
								// debugger;

								// give up
								return false;
							}
							// found way!
							else {
								// the next way matched it's startpoint
								if(!b_endpoint) {
									// reverse the next way
									a_extra_ways[i_next_way].reverse();
								}

								// remove next way from unassigned list
								let a_next_way = extract_extra_way(i_next_way);

								// remove last element
								a_next_way.pop();

								// prepend next way to beginning of current ring
								a_current_ring.unshift(...a_next_way);
							}
						}
						// found a way!
						else {
							// the next way matched its' endpoint
							if(b_endpoint) {
								// reverse the next way
								a_extra_ways[i_next_way].reverse();
							}

							// remove next way from unassigned list
							let a_next_way = extract_extra_way(i_next_way);

							// remove first element
							a_next_way.shift();

							// append next way to the end of current ring
							a_current_ring.push(...a_next_way);
						}
					}
					// found a way!
					else {
						// the next way matched it's startpoint
						if(!b_endpoint) {
							// reverse the next way
							a_unassigned_ways[i_next_way].reverse();
						}

						// remove next way from unassigned list
						let a_next_way = extract_outer_way(i_next_way);

						// remove last element
						a_next_way.pop();

						// prepend next way to beginning of current ring
						a_current_ring.unshift(...a_next_way);
					}
				}
				// found a way!
				else {
					// the next way matched its' endpoint
					if(b_endpoint) {
						// reverse the next way
						a_unassigned_ways[i_next_way].reverse();
					}

					// remove next way from unassigned list
					let a_next_way = extract_outer_way(i_next_way);

					// remove first element
					a_next_way.shift();

					// append next way to the end of current ring
					a_current_ring.push(...a_next_way);
				}
			}
		}
	}
	catch(e) {
		return false;
	}

	// prep to clean rings
	let a_rings_cleaned = [];

	// each ring
	while(a_rings.length) {
		// shift from head of list
		let a_ring = a_rings.shift();

		// try cleaning ring
		let a_clean = mk_shell(a_ring);

		// invalid ring; bail on method
		if(!a_clean) return false;

		// add cleaned ring
		a_rings_cleaned.push(a_clean);
	}

	// return valid rings
	return a_rings_cleaned;
};


const self = module.exports = {

	// attempts to create polygon from osm relation
	polygon_from_relation(h_relation) {
		// prep package to deliver
		let h_package = {
			id: `relation/${h_relation.id}`,
		};

		// prep lists
		let a_polygons = [];
		let a_holes = [];

		// prep coordinates storage
		let a_inner_ways = [];
		let a_outer_ways = [];
		let a_roleless_ways = [];

		// track role alerts for this relation
		let h_role_alerts = {};

		// each relation member
		h_relation.members.forEach((h_member) => {
			// ref member type
			let s_member_type = h_member.type;

			// osm way member
			if('way' === s_member_type) {
				// ref role
				let s_role = h_member.role;

				// inner role
				if(R_ROLE_INNER.test(s_role)) {
					a_inner_ways.push(h_member.geometry);
				}
				// outer role
				else if(R_ROLE_OUTER.test(s_role)) {
					a_outer_ways.push(h_member.geometry);
				}
				// role-less
				else if('' === s_role) {
					a_roleless_ways.push(h_member.geometry);
				}
				// ignore bullshit
				else if(R_ROLE_IGNORE.test(s_role)) {
					// skip
				}
				// other
				else {
					if(!h_role_alerts[s_role]) {
						h_role_alerts[s_role] = 1;
						local.warn(`no way to handle role: "${s_role}" relation/${h_relation.id}`);
					}
				}
			}
			// unexcusable other
			else if(-1 === A_RELATION_MEMBER_EXCEPTIONS.indexOf(s_member_type)){
				if('relation' === s_member_type) {
					h_package.has_relations = true;
				}
				else {
					local.warn(`unrecognized relation member type "${s_member_type}" relation/${h_relation.id}`);
				}
			}
		});

		// role alerts
		if(Object.keys(h_role_alerts).length) {
			debugger;
		}

		// make rings from linestrings
		let a_outer_rings = mk_rings(a_outer_ways, a_roleless_ways, true);
		let a_inner_rings = mk_rings(a_inner_ways, a_roleless_ways);

		// shitty geometry
		if(!a_outer_rings || !a_inner_rings || !a_outer_rings.length) return false;

		// single outer ring
		if(1 === a_outer_rings.length) {
			let a_outer_ring = a_outer_rings[0];

			// make polygon
			a_polygons.push({
				outer_ring: a_outer_ring,
				inner_rings: a_inner_rings,
			});
		}
		// mutliple outer rings
		else {
			// no inner rings
			if(!a_inner_ways.length) {
				// simple multipolygon
				a_polygons.push({
					outer_ring: a_outer_rings[0],
					inner_rings: a_inner_rings,
				});
			}
			// inner rings indeed
			else {
				// create the multipolygon

				// create outer rings as whole polygons
				a_polygons.push(...a_outer_rings.map((w_outer_ring) => {
					return {
						outer_ring: w_outer_ring,
					};
				}));

				// and sepearately create the holes
				a_holes.push(...a_inner_rings.map((w_inner_ring) => {
					return {
						outer_ring: w_inner_ring,
					};
				}));
			}
		}

		try {
			// create polygons
			h_package.polygons = as_multipolygon(a_polygons);

			// role alerts
			if(Object.keys(h_role_alerts).length) {
				local.info(h_package.polygons());
				debugger;
			}

			// there are holes
			if(a_holes.length) {
				h_package.holes = as_multipolygon(a_holes);
			}
		}
		catch(e) {
			return false;
		}

		// deliver package
		return h_package;
	},

	//
	polyline_from_relation(h_relation) {
		// prep package to deliver
		let h_package = {
			id: `relation/${h_relation.id}`,
		};

		// prep list of polyline geometries
		let a_ways = [];

		// each relation member
		h_relation.members.forEach((h_member) => {
			// ref member type
			let s_member_type = h_member.type;

			// osm way member
			if('way' === s_member_type) {
				// ref role
				a_ways.push(h_member.geometry);
			}
			// unexcusable other
			else if(-1 === A_RELATION_MEMBER_EXCEPTIONS.indexOf(s_member_type)) {
				if('relation' === s_member_type) {
					h_package.has_relations = true;
				}
				else {
					local.warn(`unrecognized relation member type "${s_member_type}" #${h_relation.id}`);
				}
			}
		});

		// no ways
		if(!a_ways.length) {
			// shitty geometry
			return false;
		}

		try {
			// construct polyline(s)
			h_package.polylines = as_multipolyline(a_ways);
		}
		catch(e) {
			return false;
		}

		//
		return h_package;
	},


	//
	from_way(h_way) {
		// close shell
		let a_shell = mk_shell(h_way.geometry);

		// not a polygon!
		if(!a_shell) {
			// return as polyline
			return {
				id: `way/${h_way.id}`,
				polylines: as_multipolyline([h_way.geometry]),
			};
		}

		// return package
		return {
			id: `way/${h_way.id}`,
			polygons: as_multipolygon([{
				outer_ring: a_shell,
			}]),
		};
	},

	//
	from_relation(h_relation) {
		// relation is a polygon
		if(h_relation.tags.hasOwnProperty('boundary') || -1 !== A_POLYGON_RELATION_TYPES.indexOf(h_relation.tags.type)) {
			return self.polygon_from_relation(h_relation);
		}
		// relation is a polyline
		else {
			return self.polyline_from_relation(h_relation);
		}
	},

	//
	solve(h_element) {
		// ref type
		let s_type = h_element.type;

		// element is a way
		if('way' === s_type) {
			// no geometry
			if(!h_element.geometry || !h_element.geometry.length) {
				return false;
			}
			// geometry indeed
			else {
				return self.from_way(h_element);
			}
		}
		// element is a relation
		else if('relation' === s_type) {
			// no members
			if(!h_element.members || !h_element.members.length) {
				return false;
			}
			// members indeed
			else {
				return self.from_relation(h_element);
			}
		}
		else {
			local.fail(`cannot make polygon from "${s_type}"`);
		}
	},
};
