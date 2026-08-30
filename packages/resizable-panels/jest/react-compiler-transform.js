/**
 * Jest transformer that compiles components with babel-plugin-react-compiler,
 * matching the app build (apps/main app.config.ts sets experiments.reactCompiler). The
 * resizable-panels package routes its separator a11y hooks through it (see
 * jest.config.js).
 *
 * ts-jest skips the compiler, so compiler-induced memoization bugs (e.g. stale
 * tanstack getVisibleCells caches) are invisible to normal tests. Files routed
 * to this transformer via jest.config.js render exactly as they do in the app.
 */
const babelJest = require('babel-jest').default;

module.exports = babelJest.createTransformer({
	babelrc: false,
	configFile: false,
	presets: [[require.resolve('@babel/preset-typescript'), { isTSX: true, allExtensions: true }]],
	plugins: [
		[require.resolve('babel-plugin-react-compiler'), {}],
		[require.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }],
		[require.resolve('@babel/plugin-transform-modules-commonjs'), { allowTopLevelThis: true }],
	],
});
