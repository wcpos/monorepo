const fs = require('fs');
const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

module.exports = (() => {
	const config = getDefaultConfig(__dirname);

	// I need to add mjs
	// config.resolver.sourceExts.push('mjs');

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

	return config;
})();
