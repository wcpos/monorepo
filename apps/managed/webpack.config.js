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
			},
		},
		argv
	);
	console.log(config);

	config.module.rules[1].oneOf[2].use.options.plugins = ['react-native-reanimated/plugin'];

	// Remove existing rules about SVG and inject our own
	// (Inspired by https://github.com/storybookjs/storybook/issues/6758#issuecomment-495598635)
	config.module.rules = config.module.rules.map((rule) => {
		if (rule.oneOf) {
			let hasModified = false;

			const newRule = {
				...rule,
				oneOf: rule.oneOf.map((oneOfRule) => {
					if (oneOfRule.test && oneOfRule.test.toString().includes('svg')) {
						hasModified = true;

						const test = oneOfRule.test.toString().replace('|svg', '');

						return { ...oneOfRule, test: new RegExp(test) };
					}
					return oneOfRule;
				}),
			};

			// Add new rule to use svgr
			// Place at the beginning so that the default loader doesn't catch it
			if (hasModified)
				newRule.oneOf.unshift({
					test: /\.svg$/,
					// exclude: /node_modules/,
					use: [
						{
							loader: '@svgr/webpack',
						},
					],
				});

			return newRule;
		}
		return rule;
	});

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

	return config;
};
