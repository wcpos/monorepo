// Every Expo module that declares an Android `publication` must give it a `version`: the SDK 58
// Gradle autolinking plugin decodes the config with a serializer whose `Publication.version` is
// required, so one missing field aborts EVERY Android build at settings evaluation
// ("Field 'version' is required for type ... Publication"). expo-observe 58.0.11,
// expo-app-metrics 58.0.9, expo-blob 58.0.2 and expo-device 58.0.5 ship such a block (EAS build
// 4160ee2e, 2026-09-30; the device run of 2026-10-06). The prebuilt AARs those blocks point at DO
// exist, under each package's `local-maven-repo/`; our patches remove the block, so the four build
// from source instead of using the prebuilt (independent review of monorepo#2408 corrected an
// earlier claim here that no AAR shipped). This test reads the INSTALLED configs so a bump that
// drops the patch key re-checks upstream.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);

function moduleConfig(name) {
	const pkg = require.resolve(`${name}/package.json`, {
		paths: [join(process.cwd(), 'apps/main')],
	});
	const file = join(dirname(pkg), 'expo-module.config.json');
	return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

// expo-blob 58.0.2 ships the same block (found by the first Android device run of
// `next`, 2026-09-30, right after the SDK-58 bump of expo-blob); `patches/expo-blob@58.0.2.patch`.
// expo-device 58.0.5 too (caught by the test below when it was added, 2026-10-06);
// `patches/expo-device@58.0.5.patch`.
for (const name of ['expo-observe', 'expo-app-metrics', 'expo-blob', 'expo-device']) {
	test(`${name} declares no Android publication (the patch removes the version-less block; it builds from source)`, () => {
		const config = moduleConfig(name);
		assert.ok(config, `${name} is installed with an expo-module.config.json`);
		assert.equal(config.android?.publication, undefined);
		const android =
			dirname(
				require.resolve(`${name}/package.json`, { paths: [join(process.cwd(), 'apps/main')] })
			) + '/android';
		assert.ok(
			existsSync(join(android, 'build.gradle')),
			`${name} has Android sources to build from`
		);
	});
}

test('every installed Expo module with an Android publication gives it a version', () => {
	const modulesDir = join(process.cwd(), 'node_modules');
	const offenders = [];
	for (const entry of readdirSync(modulesDir)) {
		if (!entry.startsWith('expo')) continue;
		const file = join(modulesDir, entry, 'expo-module.config.json');
		if (!existsSync(file)) continue;
		const publication = JSON.parse(readFileSync(file, 'utf8')).android?.publication;
		if (publication && !publication.version) offenders.push(entry);
	}
	assert.deepEqual(offenders, []);
});
