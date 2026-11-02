// Expo modules ship `expo-module.config.json` with an Android `publication` that carries no
// `version`: Expo's pipeline leaves it out on purpose. SDK 58's Gradle autolinking plugin decodes
// the config with a serializer whose `Publication.version` is required, so on
// expo-modules-autolinking 58.0.5 one missing field aborted EVERY Android build at settings
// evaluation ("Field 'version' is required for type ... Publication"; EAS build 4160ee2e,
// 2026-09-30). Four exact-keyed patches removed the block (expo-observe, expo-app-metrics,
// expo-blob, expo-device) so those modules built from source. expo-modules-autolinking 58.0.12
// fills the gap itself — `publication.version ?? revision.version` in
// src/platforms/android/android.ts — before Gradle sees the config, so the patches are gone and
// the prebuilt AARs under each package's `local-maven-repo/` are used, as upstream intends.
//
// This tripwire pins that default. If a bump of expo-modules-autolinking drops it, the
// version-less blocks (twenty modules on SDK 58.0.8) abort Android settings evaluation again and
// the patches come back.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const mainPaths = [join(process.cwd(), 'apps/main')];

test('expo-modules-autolinking defaults a missing Android publication version to the package revision', () => {
	const pkg = require.resolve('expo-modules-autolinking/package.json', { paths: mainPaths });
	const source = readFileSync(join(dirname(pkg), 'build/platforms/android/android.js'), 'utf8');
	assert.match(
		source,
		/version:\s*project\.publication\.version\s*\?\?\s*revision\.version/,
		'autolinking no longer fills publication.version; the version-less module configs abort Gradle settings evaluation again — restore the removal patches (1cc639fc0)'
	);
});
