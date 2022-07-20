const createExpoWebpackConfigAsync = require('@expo/webpack-config');
// const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
// const path = require('path');

module.exports = async function (env, argv) {
	const config = await createExpoWebpackConfigAsync(
		{
			...env,
			babel: {
				dangerouslyAddModulePathsToTranspile: [
					'@wcpos',
					// '@wcpos/themes',
					// '@wcpos/components',
					// path.resolve("../../packages/common/src"),
				],
				plugins: ['react-native-reanimated/plugin'],
			},
		},
		argv
	);

	if (config.devServer) {
		config.devServer.watchOptions = {
			ignored: '**/node_modules',
		};

		config.devServer.headers = config.devServer.headers || {};
		config.devServer.headers['Access-Control-Allow-Origin'] = '*';
	}

	// Optionally you can enable the bundle size report.
	// It's best to do this only with production builds because it will add noticeably more time to your builds and reloads.
	// if (env.mode === 'production') {
	// 	config.plugins.push(
	// 		new BundleAnalyzerPlugin({
	// 			path: 'web-report',
	// 		})
	// 	);
	// }
	console.log(config);
	delete config.devServer; // hack for expo 46 beta

	return config;
};
