// Pins patches/@expo__cli@57.0.16.patch: a STRING runtimeVersion must be served
// from the config the manifest request already evaluated, without spawning the
// `expo-updates runtimeversion:resolve` CLI. Native E2E pins a string runtime
// (WCPOS_E2E_RUNTIME_VERSION) and the iOS dev launcher gives the manifest a hard
// 10 s; the per-request node child pushed it over that on the loaded macOS
// runner (apps/main/.maestro/README.md §4, "There was a problem loading the
// project"). If this fails after an @expo/cli bump, port the patch — do not
// raise a Maestro wait.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const appRequire = createRequire(
	join(dirname(fileURLToPath(import.meta.url)), '../apps/main/package.json')
);
const middlewarePath = appRequire.resolve(
	'@expo/cli/build/src/start/server/middleware/ExpoGoManifestHandlerMiddleware'
);
const cliResolverPath = join(
	dirname(middlewarePath),
	'resolveRuntimeVersionWithExpoUpdatesAsync.js'
);

const cliCalls = [];
// Stand in for the module that spawns the expo-updates CLI, before the
// middleware's top-level require binds it.
appRequire.cache[cliResolverPath] = {
	id: cliResolverPath,
	filename: cliResolverPath,
	loaded: true,
	exports: {
		resolveRuntimeVersionWithExpoUpdatesAsync: async (options) => {
			cliCalls.push(options);
			return 'runtime-from-cli';
		},
	},
};
const { ExpoGoManifestHandlerMiddleware } = appRequire(middlewarePath);

async function manifestFor(exp) {
	cliCalls.length = 0;
	const middleware = Object.create(ExpoGoManifestHandlerMiddleware.prototype);
	middleware.projectRoot = '/project';
	middleware.options = {};
	middleware._resolveProjectSettingsAsync = async () => ({
		exp: { slug: 'wcpos', ...exp },
		hostUri: 'localhost:8081',
		expoGoConfig: {},
		bundleUrl: 'http://localhost:8081/node_modules/expo-router/entry.bundle',
	});
	const originalScopeKey = ExpoGoManifestHandlerMiddleware.getScopeKeyAsync;
	// The real one reads and writes ~/.expo; the scope key is not under test.
	ExpoGoManifestHandlerMiddleware.getScopeKeyAsync = async () => '@anonymous/wcpos';
	try {
		const response = await middleware._getManifestResponseAsync({
			platform: 'ios',
			hostname: 'localhost',
			protocol: 'http',
			responseContentType: 2, // application/expo+json, what the dev launcher asks for
			expectSignature: null,
		});
		return JSON.parse(await response.text());
	} finally {
		ExpoGoManifestHandlerMiddleware.getScopeKeyAsync = originalScopeKey;
	}
}

test('a string runtime is served without spawning the expo-updates CLI', async () => {
	const manifest = await manifestFor({ runtimeVersion: 'pinned-e2e-runtime' });
	assert.equal(manifest.runtimeVersion, 'pinned-e2e-runtime');
	assert.equal(cliCalls.length, 0);
});

test('a platform-specific string runtime wins, as the CLI resolves it', async () => {
	const manifest = await manifestFor({
		runtimeVersion: { policy: 'fingerprint' },
		ios: { runtimeVersion: 'ios-pinned-runtime' },
	});
	assert.equal(manifest.runtimeVersion, 'ios-pinned-runtime');
	assert.equal(cliCalls.length, 0);
});

test('a runtime policy still resolves through the expo-updates CLI', async () => {
	const manifest = await manifestFor({ runtimeVersion: { policy: 'fingerprint' } });
	assert.equal(manifest.runtimeVersion, 'runtime-from-cli');
	assert.deepEqual(cliCalls, [{ projectRoot: '/project', platform: 'ios' }]);
});
