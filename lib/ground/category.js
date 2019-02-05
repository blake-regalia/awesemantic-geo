const pg = require('pg');
const graphy = require('graphy');

let a_places = ["Arrow_Rock,_Missouri", "Augusta,_Missouri", "Atchison,_Kansas", "Bellevue,_Nebraska", "Bismarck,_North_Dakota", "Black_Eagle,_Montana", "Boonville,_Missouri", "Bridgeton,_Missouri", "Brockton,_Montana", "Brownville,_Nebraska", "Cannon_Ball,_North_Dakota", "Carter_Lake,_Iowa", "Cascade,_Montana", "Chamberlain,_South_Dakota", "Chamois,_Missouri", "Chesterfield,_Missouri", "Council_Bluffs,_Iowa", "Culbertson,_Montana", "Dakota_City,_Nebraska", "Decatur,_Nebraska", "Defiance,_Missouri", "Elwood,_Kansas", "Florissant,_Missouri", "Fort_Benton,_Montana", "Fort_Peck,_Montana", "Fort_Pierre,_South_Dakota", "Fort_Thompson,_South_Dakota", "Fort_Yates,_North_Dakota", "Frazer,_Montana", "Gasconade,_Missouri", "Glasgow,_Missouri", "Great_Falls,_Montana", "Hazelwood,_Missouri", "Hermann,_Missouri", "Iatan,_Missouri", "Independence,_Missouri", "Jefferson_City,_Missouri", "Kansas_City,_Kansas", "Kansas_City,_Missouri", "Lansing,_Kansas", "Leavenworth,_Kansas", "Lexington,_Missouri", "Loma,_Montana", "Lower_Brule,_South_Dakota", "Lupus,_Missouri", "Mandan,_North_Dakota", "Maryland_Heights,_Missouri", "Matson,_Missouri", "Miami,_Missouri", "Missouri_City,_Missouri", "Mobridge,_South_Dakota", "Napoleon,_Missouri", "Nebraska_City,_Nebraska", "New_Haven,_Missouri", "Niobrara,_Nebraska", "North_Kansas_City,_Missouri", "Oacoma,_South_Dakota", "Old_Jamestown,_Missouri", "Omaha,_Nebraska", "Parkville,_Missouri", "Pick_City,_North_Dakota", "Pickstown,_South_Dakota", "Pierre,_South_Dakota", "Plattsmouth,_Nebraska", "Poplar,_Montana", "Randolph,_Missouri", "Rhineland,_Missouri", "Riverdale,_North_Dakota", "Riverside,_Missouri", "Rocheport,_Missouri", "Rulo,_Nebraska", "St._Albans,_Missouri", "St._Charles,_Missouri", "St._Joseph,_Missouri", "Santee,_Nebraska", "Sibley,_Missouri", "Sioux_City,_Iowa", "South_Sioux_City,_Nebraska", "Springfield,_South_Dakota", "Stanton,_North_Dakota", "Sugar_Creek,_Missouri", "Toston,_Montana", "Townsend,_Montana", "Ulm,_Montana", "Washburn,_North_Dakota", "Washington,_Missouri", "Waverly,_Missouri", "Weldon_Spring,_Missouri", "West_Alton,_Missouri", "White_Cloud,_Kansas", "Wildwood,_Missouri", "Williston,_North_Dakota", "Wolf_Point,_Montana", "Yankton,_South_Dakota"];

let as_places = new Set(a_places);



(async() => {
	let k_tree = await process.stdin
		.pipe(graphy.content.ttl.read())
		.pipe(graphy.util.dataset.tree())
		.until('finish', true);

	let a_matching = [];
	let a_missing = [];
	let a_extras = [];
	for(let y_quad of k_tree) {
		let si_dbr_obj = y_quad.object.value.slice('http://dbpedia.org/resource/'.length);
		if(as_places.has(si_dbr_obj)) {
			a_matching.push(si_dbr_obj);
			as_places.delete(si_dbr_obj);
		}
		else {
			a_extras.push(si_dbr_obj);
		}
	}

	a_missing = [...as_places];

	console.log(JSON.stringify({
		matching: a_matching,
		missing: a_missing,
		// extras: a_extras,
	}, null, '\t')+'\n');

	console.log(`
		places: ${a_places.length}
		matching: ${a_matching.length}
		missing: ${a_missing.length}
		extras: ${a_extras.length}
	`)
})();