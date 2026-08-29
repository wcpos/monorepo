const assert = require('node:assert/strict');
const test = require('node:test');

const {
	DEV_MENU_DEFAULTS,
	setInfoPlistDefaults,
	setManifestDefaults,
} = require('./with-quiet-dev-menu');

const sampleManifest = (metaData) => ({
	manifest: {
		application: [{ $: { 'android:name': '.MainApplication' }, 'meta-data': metaData }],
	},
});

// The three keys are the ones expo-dev-menu reads as defaults
// (DevMenuPreferences.swift / DevMenuPreferences.kt); a renamed key is a
// silent no-op on device, so the names are pinned here.
test('sets exactly the three expo-dev-menu launch defaults', () => {
	assert.deepEqual(DEV_MENU_DEFAULTS, {
		EXDevMenuShowFloatingActionButton: false,
		EXDevMenuShowsAtLaunch: false,
		EXDevMenuIsOnboardingFinished: true,
	});
});

test('adds the keys to Info.plist and keeps the existing entries', () => {
	const result = setInfoPlistDefaults({ CFBundleDisplayName: 'WCPOS' });
	assert.equal(result.CFBundleDisplayName, 'WCPOS');
	assert.equal(result.EXDevMenuShowFloatingActionButton, false);
	assert.equal(result.EXDevMenuShowsAtLaunch, false);
	assert.equal(result.EXDevMenuIsOnboardingFinished, true);
});

test('adds <meta-data> entries to the application element', () => {
	const result = setManifestDefaults(sampleManifest(undefined));
	const application = result.manifest.application[0];
	assert.equal(application.$['android:name'], '.MainApplication');
	const byName = Object.fromEntries(
		application['meta-data'].map((item) => [item.$['android:name'], item.$['android:value']])
	);
	assert.deepEqual(byName, {
		EXDevMenuShowFloatingActionButton: 'false',
		EXDevMenuShowsAtLaunch: 'false',
		EXDevMenuIsOnboardingFinished: 'true',
	});
});

test('is idempotent and overrides a pre-existing entry instead of duplicating it', () => {
	const manifest = sampleManifest([
		{ $: { 'android:name': 'EXDevMenuShowsAtLaunch', 'android:value': 'true' } },
		{ $: { 'android:name': 'other', 'android:value': 'keep' } },
	]);
	const twice = setManifestDefaults(setManifestDefaults(manifest));
	const metaData = twice.manifest.application[0]['meta-data'];
	assert.equal(metaData.length, 4);
	const showsAtLaunch = metaData.filter(
		(item) => item.$['android:name'] === 'EXDevMenuShowsAtLaunch'
	);
	assert.equal(showsAtLaunch.length, 1);
	assert.equal(showsAtLaunch[0].$['android:value'], 'false');
	assert.ok(metaData.some((item) => item.$['android:name'] === 'other'));
});

test('throws on a manifest without an application element', () => {
	assert.throws(() => setManifestDefaults({ manifest: {} }), /could not find <application>/);
});
