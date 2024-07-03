/**
 * Jest runs Babel synchronously so we need to use the CommonJS module system.
 */
module.exports = function (api) {
	api.cache(true);
	return {
		presets: [
			'@babel/preset-env',
			'@babel/preset-typescript',
			'@babel/preset-react',
		],
	};
};
