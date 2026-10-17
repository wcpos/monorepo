/* global __dirname */
const { join } = require('node:path');

const { SourceSkips } = require('@expo/fingerprint');

const { nativePatchFiles } = require('./fingerprint-patches');

// Every patch release changes the app version, but OTA updates must match the
// installed binary's runtime version. Keep version fields out of that hash.
//
// The balanced preset (the default since @expo/fingerprint 0.21) hashes each autolinked
// native module as `name@version`, so pnpm patches alone leave that hash unchanged.
// Hash a patch unless every file it touches is plain app JS/TS (fail safe); JS-only
// patches reach the app through Metro and stay out.
// An explicit `sourceSkips` replaces the balanced preset's own skip list rather than
// adding to it, so only `ExpoConfigVersions` is skipped.
const PATCHES_DIR = join(__dirname, '../../patches');

const nativePatches = nativePatchFiles(PATCHES_DIR);

module.exports = {
	preset: 'balanced',
	sourceSkips: SourceSkips.ExpoConfigVersions,
	extraSources: nativePatches.map((name) => ({
		type: 'file',
		filePath: `../../patches/${name}`,
		reasons: ['pnpm patch of native code'],
	})),
};
