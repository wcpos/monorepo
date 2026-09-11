const assert = require('node:assert/strict');
const test = require('node:test');

const { mergePermissions, addMavenRepository, mergeInfoPlist } = require('./with-sumup-reader');

test('merges permissions once and limits legacy Bluetooth to Android 11', () => {
	const manifest = {
		manifest: {
			'uses-permission': [
				{ $: { 'android:name': 'android.permission.INTERNET' } },
				{ $: { 'android:name': 'android.permission.BLUETOOTH' } },
				{
					$: {
						'android:name': 'android.permission.BLUETOOTH_SCAN',
						'android:usesPermissionFlags': 'neverForLocation',
					},
				},
			],
		},
	};
	mergePermissions(manifest);
	mergePermissions(manifest);
	const permissions = manifest.manifest['uses-permission'];
	assert.equal(permissions.length, 7);
	for (const name of ['BLUETOOTH', 'BLUETOOTH_ADMIN'])
		assert.equal(
			permissions.find((p) => p.$['android:name'] === `android.permission.${name}`).$[
				'android:maxSdkVersion'
			],
			'30'
		);
	assert.equal(
		permissions.find((p) => p.$['android:name'].endsWith('BLUETOOTH_SCAN')).$[
			'android:usesPermissionFlags'
		],
		'neverForLocation'
	);
});
test('adds Maven to allprojects once, not buildscript repositories', () => {
	const source =
		'buildscript { repositories { google() } }\nallprojects {\n repositories {\n google()\n }\n}';
	const once = addMavenRepository(source);
	assert.match(
		once,
		/allprojects\s*{\s*repositories\s*{\s*maven \{ url 'https:\/\/maven.sumup.com\/releases' \}/
	);
	assert.equal(addMavenRepository(once), once);
	assert.throws(() => addMavenRepository('buildscript { repositories {} }'), /allprojects/);
});
test('keeps existing plist strings and supplies missing usage descriptions', () => {
	const existing = {
		NSLocationWhenInUseUsageDescription: 'Store location text',
		NSBluetoothAlwaysUsageDescription: 'Existing Bluetooth text',
	};
	assert.deepEqual(mergeInfoPlist({ ...existing }), existing);
	const defaults = mergeInfoPlist({});
	assert.match(defaults.NSLocationWhenInUseUsageDescription, /WCPOS.*card/);
	assert.match(defaults.NSBluetoothAlwaysUsageDescription, /WCPOS.*card/);
	assert.deepEqual(mergeInfoPlist({ ...defaults }), defaults);
});
test('does not mistake a buildscript repository for allprojects dependency resolution', () => {
	const source =
		"buildscript { repositories { maven { url 'https://maven.sumup.com/releases' } } }\nallprojects { repositories { google() } }";
	const once = addMavenRepository(source);
	assert.match(once, /allprojects\s*{\s*repositories\s*{\s*maven/);
	assert.equal(addMavenRepository(once), once);
});
