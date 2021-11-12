const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const path = require('path');

module.exports = async function (env, argv) {
	const config = await createExpoWebpackConfigAsync(
		{
			...env,
			babel: {
				dangerouslyAddModulePathsToTranspile: [
					'@wcpos/common',
					// path.resolve("../../packages/common/src"),
				],
			},
		},
		argv
	);
	console.log(config.module.rules);

	config.module.rules[1].oneOf[2].use.options.plugins = ['react-native-reanimated/plugin'];

	return config;
};
