const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Add electron support
if (process.env.ELECTRON === 'true') {
	config.resolver.sourceExts = config.resolver.sourceExts || [];
	config.resolver.sourceExts.unshift(
		'electron.ts',
		'electron.tsx',
		'electron.js',
		'electron.jsx',
		'electron.json',
		'electron.cjs',
		'electron.mjs'
	);
}

// Use turborepo to restore the cache when possible, using the community standard `node_modules/.cache` folder
// Moving this folder within the project allows for simple cache management in CI, and is easy to reset
config.cacheStores = [
	new FileStore({ root: path.join(__dirname, 'node_modules', '.cache', 'metro') }),
];

module.exports = withNativeWind(config, { input: './global.css' });
