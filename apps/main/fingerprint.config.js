/* global __dirname */
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const { SourceSkips } = require('@expo/fingerprint');

// Every patch release changes the app version, but OTA updates must match the
// installed binary's runtime version. Keep version fields out of that hash.
//
// The balanced preset (the default since @expo/fingerprint 0.21) hashes each autolinked
// native module as `name@version`, and an explicit `sourceSkips` keeps that setting. So a
// pnpm patch that edits a module's Kotlin, Swift or Objective-C leaves the fingerprint
// unchanged: a stale E2E dev-client cache and an identical `eas fingerprint:compare`. Hash
// every patch that touches a native file as its own source. JS-only patches reach the
// app through Metro and stay out.
const PATCHES_DIR = join(__dirname, '../../patches');
const NATIVE_FILE =
	/^diff --git a\/(\S*\/)?(android|ios)\/|^diff --git a\/\S+\.(kt|java|swift|m|mm|h|hpp|c|cpp|gradle|podspec)\s/m;

const nativePatches = readdirSync(PATCHES_DIR)
	.filter((name) => name.endsWith('.patch'))
	.filter((name) => NATIVE_FILE.test(readFileSync(join(PATCHES_DIR, name), 'utf8')))
	.sort();

module.exports = {
	preset: 'balanced',
	sourceSkips: SourceSkips.ExpoConfigVersions,
	extraSources: nativePatches.map((name) => ({
		type: 'file',
		filePath: `../../patches/${name}`,
		reasons: ['pnpm patch of native code'],
	})),
};
