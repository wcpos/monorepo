const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const mainDirectory = path.dirname(require.resolve('../package.json'));
// The CLI directly, not `pnpm exec`: pnpm writes its lockfile-sync warning to stdout,
// ahead of the JSON.
const expoCli = require.resolve('expo/bin/cli', { paths: [mainDirectory] });

// `--type introspect` runs the config plugins, so the result carries the manifest the
// plugins produce — not only the static `android.permissions` list.
const introspect = (easProfile) =>
	JSON.parse(
		execFileSync(process.execPath, [expoCli, 'config', '--type', 'introspect', '--json'], {
			cwd: mainDirectory,
			encoding: 'utf8',
			env: { ...process.env, EAS_BUILD_PROFILE: easProfile },
		})
	);

const manifestPermissions = (config) => {
	const manifest = config._internal?.modResults?.android?.manifest?.manifest;
	assert.ok(manifest, 'introspect returned no Android manifest');
	const removed = new Set();
	const kept = new Set();
	for (const entry of manifest['uses-permission'] ?? []) {
		const name = entry.$['android:name'];
		if (entry.$['tools:node'] === 'remove') removed.add(name);
		else kept.add(name);
	}
	return { removed, kept };
};

// Audit of the 2026-10-01 dev client (aapt2 over the EAS APK, 2026-10-05): the WebRTC
// config plugin declares microphone + audio permissions for a data-channel-only use, and
// its Info.plist mod overwrote the barcode scanner's camera wording. These pins fail the
// moment a plugin reorder or a dependency bump reintroduces either.
test.describe('Android manifest carries no permission the app does not use', () => {
	for (const profile of ['development', 'production']) {
		test(`${profile}: RECORD_AUDIO and MODIFY_AUDIO_SETTINGS are removed`, () => {
			const { removed, kept } = manifestPermissions(introspect(profile));
			for (const name of [
				'android.permission.RECORD_AUDIO',
				'android.permission.MODIFY_AUDIO_SETTINGS',
			]) {
				assert.ok(removed.has(name), `${name} should be blocked`);
				assert.ok(!kept.has(name), `${name} is still declared`);
			}
		});
	}

	test('SYSTEM_ALERT_WINDOW survives only in the dev client (React Native debug overlay)', () => {
		const name = 'android.permission.SYSTEM_ALERT_WINDOW';
		assert.ok(manifestPermissions(introspect('development')).kept.has(name));
		assert.ok(manifestPermissions(introspect('production')).removed.has(name));
	});

	test('card readers keep location and Bluetooth (Stripe Terminal refuses to initialize without them)', () => {
		const { kept } = manifestPermissions(introspect('production'));
		for (const name of [
			'android.permission.ACCESS_FINE_LOCATION',
			'android.permission.BLUETOOTH_SCAN',
			'android.permission.BLUETOOTH_CONNECT',
			'android.permission.CAMERA',
		])
			assert.ok(kept.has(name), `${name} missing`);
	});
});

test('iOS camera prompt describes the barcode scanner, not WebRTC', () => {
	const { infoPlist } = introspect('production').ios;
	assert.equal(
		infoPlist.NSCameraUsageDescription,
		'WCPOS uses the camera to scan product barcodes.'
	);
	assert.equal(infoPlist.NSMicrophoneUsageDescription, 'WCPOS does not use the microphone.');
});
