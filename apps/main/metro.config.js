const path = require('path');

// Load .env from monorepo root before Metro starts
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');
const { withUniwindConfig } = require('uniwind/metro');

let config = getDefaultConfig(__dirname);

// rxdb-premium/plugins/shared has both CJS and ESM builds. Metro resolves the package
// export to CJS (via the "require" condition), but the storage modules use relative ESM
// imports (../../plugins/shared/version-check.js). This creates two separate module
// instances with independent `o` flags, so calling disableVersionCheck() on the CJS
// copy doesn't disable the check in the ESM copy that the storage code actually runs.
//
// Fix: redirect the package export to the ESM build so both import paths resolve to the
// same module instance and disableVersionCheck() works correctly.
const rxdbPremiumESMShared = path.join(
	path.dirname(require.resolve('rxdb-premium/package.json')),
	'dist/esm/plugins/shared/index.js'
);

// Redirect rxdb-premium/plugins/shared to ESM so disableVersionCheck() and storage
// modules share one module instance (fixes SNH version mismatch in Metro bundles).
const _baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName === 'rxdb-premium/plugins/shared') {
		return { type: 'sourceFile', filePath: rxdbPremiumESMShared };
	}
	if (_baseResolveRequest) {
		return _baseResolveRequest(context, moduleName, platform);
	}
	return context.resolveRequest(context, moduleName, platform);
};

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

// Enable Atlas analytics when EXPO_UNSTABLE_ATLAS is set
// This must be done last to wrap all other Metro configurations
if (process.env.EXPO_UNSTABLE_ATLAS === 'true') {
	const { withExpoAtlas } = require('expo-atlas/metro');
	config = withExpoAtlas(config);
}

module.exports = withUniwindConfig(config, {
	cssEntryFile: './global.css',
	extraThemes: ['ocean', 'sunset', 'monochrome'],
});
