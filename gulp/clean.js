const del = require('del');

module.exports = function(gulp, $, p_src, p_dest) {
	return del.sync([p_dest]);
}
