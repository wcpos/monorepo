const path = require('path');

// Load .env from monorepo root before Metro starts
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');
const { withUniwindConfig } = require('uniwind/metro');

let config = getDefaultConfig(__dirname);

// rxdb and rxdb-premium ship both CJS and ESM builds. Metro resolves bare-specifier
// imports (e.g. `rxdb/plugins/utils`, `rxdb-premium/plugins/shared`) via the "require"
// export condition → CJS, while internal relative imports within the ESM builds stay ESM.
// This creates two separate module instances with independent state:
//
// 1. `disableVersionCheck()` / `setPremiumFlag()` called via CJS don't affect the ESM
//    copies that storage and collection code actually use.
// 2. `RXDB_UTILS_GLOBAL` (a plain module-scoped object) is duplicated, so
//    setPremiumFlag() sets it on one copy while hasPremiumFlag() checks the other.
//
// Fix: redirect both package exports to their ESM builds so all import paths resolve to
// the same module instances.
const rxdbPremiumESMShared = path.join(
	path.dirname(require.resolve('rxdb-premium/package.json')),
	'dist/esm/plugins/shared/index.js'
);
const rxdbESMUtils = path.join(
	path.dirname(require.resolve('rxdb/package.json')),
	'dist/esm/plugins/utils/index.js'
);

const _baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName === 'rxdb-premium/plugins/shared') {
		return { type: 'sourceFile', filePath: rxdbPremiumESMShared };
	}
	if (moduleName === 'rxdb/plugins/utils') {
		return { type: 'sourceFile', filePath: rxdbESMUtils };
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
