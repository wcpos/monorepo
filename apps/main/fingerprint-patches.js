const { readdirSync, readFileSync } = require('node:fs');
const { basename, join } = require('node:path');

// Fail safe: only plain app JS/TS can stay out of the native fingerprint.
// Unknown files and patches with no parseable paths must be hashed.
function patchedPaths(patchText) {
	return Array.from(patchText.matchAll(/^diff --git a\/(\S+) b\/\S+\r?$/gm), (match) => match[1]);
}

function isJsOnlyPath(path) {
	const name = basename(path);
	return (
		/\.(js|mjs|cjs|jsx|ts|tsx)$/.test(path) &&
		!/(^|\/)(android|ios|apple|macos|cpp|jni|plugin)(\/|$)/.test(path) &&
		name !== 'app.plugin.js' &&
		name !== 'react-native.config.js' &&
		!/^Native[A-Z]\w*\.(js|jsx|ts|tsx)$/.test(name) &&
		!/NativeComponent\.(js|jsx|ts|tsx)$/.test(name)
	);
}

function isNativePatch(patchText) {
	const paths = patchedPaths(patchText);
	return paths.length === 0 || paths.some((path) => !isJsOnlyPath(path));
}

function nativePatchFiles(patchesDir) {
	return readdirSync(patchesDir)
		.filter((name) => name.endsWith('.patch'))
		.filter((name) => isNativePatch(readFileSync(join(patchesDir, name), 'utf8')))
		.sort();
}

module.exports = { patchedPaths, isJsOnlyPath, isNativePatch, nativePatchFiles };
