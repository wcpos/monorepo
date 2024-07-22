const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Find the project and workspace directories
const projectRoot = __dirname;
// This can be replaced with `find-yarn-workspace-root`
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];
// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, 'node_modules'),
	path.resolve(workspaceRoot, 'node_modules'),
];

//
if (process.env.ELECTRON === 'true') {
	config.resolver.sourceExts = [
		'electron.ts',
		'electron.tsx',
		'electron.js',
		'electron.jsx',
		'electron.json',
		'electron.cjs',
		'electron.mjs',
		'web.ts',
		'web.tsx',
		'web.js',
		'web.jsx',
		'web.json',
		'web.cjs',
		'web.mjs',
		'ts',
		'tsx',
		'js',
		'jsx',
		'json',
		'cjs',
		'mjs',
	];
}

module.exports = withNativeWind(config, { input: './global.css' });
