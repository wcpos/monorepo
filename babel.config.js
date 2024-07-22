module.exports = function (api) {
	api.cache(true);
	return {
		presets: [
			['babel-preset-expo', { jsxRuntime: 'automatic', jsxImportSource: 'nativewind' }],
			'@babel/preset-typescript',
			'nativewind/babel',
		],
		plugins: ['react-native-reanimated/plugin', '@babel/plugin-proposal-export-namespace-from'],
	};
};
