const {
	override,
	babelInclude,
	addDecoratorsLegacy,
	addBabelPlugins,
	addWebpackAlias,
	addWebpackModuleRule,
	addBundleVisualizer,
	addWebpackResolve,
	addWebpackPlugin,
	// setWebpackTarget,
	// getBabelLoader,
	disableChunk,
} = require('customize-cra');
const path = require('path');
const webpack = require('webpack');

const addWorkerLoader = () => (config) => {
	config.output.globalObject = 'this';
	config.module.rules.unshift({ test: /\.worker\.js$/, use: { loader: 'worker-loader' } });
	return config;
};

module.exports = override(
	addWorkerLoader(),
	addDecoratorsLegacy(),
	...addBabelPlugins(
		// 'babel-plugin-react-native-web',
		// '@babel/plugin-proposal-class-properties',
		'react-native-reanimated/plugin'
		// '@babel/plugin-proposal-optional-chaining', // create-react-app 3.3
		// '@babel/plugin-proposal-nullish-coalescing-operator' // create-react-app 3.3
		// '@babel/plugin-proposal-export-default-from'
	),
	babelInclude([
		// tell Babel to include common files
		path.resolve('src'),
		path.resolve('../../packages/common'),
		path.resolve('../../node_modules/react-native-screens'),
		path.resolve('../../node_modules/react-native-reanimated'),
		path.resolve('../../node_modules/react-native-gesture-handler'),
	]),
	addWebpackAlias({
		'react-native-linear-gradient': 'react-native-web-linear-gradient',
	}),
	// addWebpackModuleRule({
	// 	test: /\.svg$/,
	// 	exclude: /node_modules/,
	// 	use: [{ loader: '@svgr/webpack' }],
	// }),
	addWebpackPlugin(
		new webpack.DefinePlugin({
			'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
			__DEV__: process.env.NODE_ENV === 'production' || true,
		})
	),
	addBundleVisualizer({ openAnalyzer: false }),
	// note: we're using web build process for desktop/electron
	process.env.PLATFORM !== 'electron' && process.env.NODE_ENV === 'production' && disableChunk(),
	process.env.PLATFORM === 'electron' &&
		addWebpackResolve({
			extensions: [
				'.electron.js',
				'.electron.ts',
				'.electron.tsx',
				'.web.mjs',
				'.mjs',
				'.web.js',
				'.js',
				'.web.ts',
				'.ts',
				'.web.tsx',
				'.tsx',
				'.json',
				'.web.jsx',
				'.jsx',
			],
		})
	// process.env.PLATFORM === 'electron' && setWebpackTarget('electron-renderer')
);
