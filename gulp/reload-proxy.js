const child_process = require('child_process');

let u_proxy;
const spawn = (p_dest) => {
	u_proxy = child_process.fork(p_dest+'/proxy.js');
};

module.exports = function(gulp, $, p_src, p_dest) {
	if(u_proxy) {
		u_proxy.on('close', () => spawn(p_dest));
		u_proxy.kill();
	}
	else {
		spawn(p_dest);
	}
};
