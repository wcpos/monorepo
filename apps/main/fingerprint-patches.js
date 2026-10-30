const { readdirSync, readFileSync } = require('node:fs');
const { basename, join } = require('node:path');

// Listing a patch here keeps it out of the fingerprint unless it touches native-looking paths.
// Only list a patch after reading it: no native code, config plugin, prebuild,
// autolinking or Codegen input. Hashing an unlisted patch is the safe default.
const JS_ONLY_PATCHES = Object.freeze({
	'@expo__cli@58.1.11.patch': 'dev-server manifest middleware (expo start), not prebuild or build',
	'@shopify__flash-list@2.3.2.patch': 'RecyclerView runtime JS bundled by Metro',
	'@shopify__react-native-skia@2.14.0.patch': 'Platform.web files, never in a native bundle',
	'expo@58.0.14.patch': 'TypeScript declarations only',
	'@rn-primitives__popover@1.5.2.patch': 'Platform.web files, never in a native bundle',
	'@rn-primitives__select@1.5.2.patch': 'Platform.web files, never in a native bundle',
	'react-native-drawer-layout@4.2.10.patch':
		'Drawer.native.js is a Metro platform file, runtime JS',
	'rxdb@17.6.0.patch': 'RxDB runtime JS bundled by Metro',
});

function patchedPaths(patchText) {
	const paths = [];
	for (const line of patchText.split('\n')) {
		if (!line.startsWith('diff --git ')) continue;
		const match = line.match(/^diff --git a\/(\S+) b\/(\S+)\r?$/);
		if (!match) return null;
		paths.push(match[1], match[2]);
	}
	return paths;
}

function isJsOnlyPath(path) {
	const name = basename(path);
	return (
		/\.(js|mjs|cjs|jsx|ts|tsx)$/.test(path) &&
		!/(^|\/)(android|ios|apple|macos|cpp|jni|plugin)(\/|$)/.test(path) &&
		name !== 'app.plugin.js' &&
		name !== 'react-native.config.js' &&
		!/^Native./.test(name) &&
		!/.NativeComponent/.test(name)
	);
}

function isNativePatch(patchText) {
	const paths = patchedPaths(patchText);
	return paths === null || paths.length === 0 || paths.some((path) => !isJsOnlyPath(path));
}

function nativePatchFiles(patchesDir, jsOnly = JS_ONLY_PATCHES) {
	return readdirSync(patchesDir)
		.filter((name) => name.endsWith('.patch'))
		.filter(
			(name) =>
				!Object.hasOwn(jsOnly, name) || isNativePatch(readFileSync(join(patchesDir, name), 'utf8'))
		)
		.sort();
}

module.exports = { JS_ONLY_PATCHES, patchedPaths, isJsOnlyPath, isNativePatch, nativePatchFiles };
