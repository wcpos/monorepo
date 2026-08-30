const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const packageJson = require('../package.json');
const mainDirectory = path.dirname(require.resolve('../package.json'));

const resolveExpoConfig = (easProfile) =>
	JSON.parse(
		execFileSync('pnpm', ['exec', 'expo', 'config', '--json'], {
			cwd: mainDirectory,
			encoding: 'utf8',
			env: { ...process.env, EAS_BUILD_PROFILE: easProfile },
		})
	);

test('release bumps do not change the development client native fingerprint', () => {
	// The dev-client version is DEV_CLIENT_NATIVE_VERSION in app.config.ts — a
	// frozen constant, so a package bump must leave it behind.
	const developmentVersion = resolveExpoConfig('development').version;
	assert.match(developmentVersion, /^\d+\.\d+\.\d+$/);
	assert.notEqual(developmentVersion, packageJson.version);
});

test('production builds use the package version', () => {
	assert.equal(resolveExpoConfig('production').version, packageJson.version);
});
