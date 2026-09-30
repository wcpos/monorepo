// Every Expo module that declares an Android `publication` must give it a `version`, and a
// publication without a shipped artefact must not be declared at all: the SDK 58 Gradle
// autolinking plugin decodes the config with a serializer whose `Publication.version` is
// required, so one missing field aborts EVERY Android build at settings evaluation
// ("Field 'version' is required for type ... Publication"). expo-observe 58.0.11 and
// expo-app-metrics 58.0.9 ship such a block with no prebuilt AAR behind it (EAS build
// 4160ee2e, 2026-09-30); `patches/expo-observe@58.0.11.patch` and
// `patches/expo-app-metrics@58.0.9.patch` remove the block so both build from source. This
// test reads the INSTALLED configs so a bump that drops the patch key re-checks upstream.
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
for (const name of ['expo-observe', 'expo-app-metrics', 'expo-blob']) {
	test(`${name} declares no Android publication (none is shipped; the patch removes the stray block)`, () => {
		const config = moduleConfig(name);
		assert.ok(config, `${name} is installed with an expo-module.config.json`);
		assert.equal(config.android?.publication, undefined);
		const android =
			dirname(
				require.resolve(`${name}/package.json`, { paths: [join(process.cwd(), 'apps/main')] })
			) + '/android';
		const shipped = existsSync(android)
			? readdirSync(android).filter((f) => f.endsWith('.aar'))
			: [];
		assert.deepEqual(
			shipped,
			[],
			`${name} ships no prebuilt AAR, so a publication would resolve nothing`
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
