const { createRunOncePlugin, withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

const pkg = 'with-wcpos-quiet-dev-menu';

// The dev client's dev menu (expo-dev-menu) has three launch-time behaviours
// that are all overlays on top of the app: a floating action button that opens
// the menu, the menu opening by itself at launch, and a one-time onboarding
// card. Every one of them has cost the native E2E suite (Maestro) real
// failures — the floating button sits over the cart header's "+" on phones,
// so a tap on `add-cart-item-menu` opened the dev menu instead (2026-08-29),
// and the launch-time menu/onboarding pair produced the conditional-dismissal
// blocks in flows 01/02 (#1662, #1675).
//
// expo-dev-menu reads its DEFAULTS for these from Info.plist / manifest
// meta-data (ios/Modules/DevMenuPreferences.swift `setup()`,
// android/.../DevMenuPreferences.kt `metaDataBool`), and a developer can still
// flip them at runtime in the dev menu's own settings — these are defaults,
// not locks. The menu itself stays reachable (shake, Cmd+D / Ctrl+M).
//
// Only the `development` profile includes this plugin (app.config.ts): the
// dev client is the build the E2E suite drives, and production builds carry
// no dev menu at all.
const DEV_MENU_DEFAULTS = {
	EXDevMenuShowFloatingActionButton: false,
	EXDevMenuShowsAtLaunch: false,
	EXDevMenuIsOnboardingFinished: true,
};

function setInfoPlistDefaults(infoPlist) {
	return { ...infoPlist, ...DEV_MENU_DEFAULTS };
}

function setManifestDefaults(manifest) {
	const application = manifest?.manifest?.application?.[0];
	if (!application) {
		throw new Error('with-wcpos-quiet-dev-menu: could not find <application> in AndroidManifest');
	}
	const metaData = (application['meta-data'] = application['meta-data'] ?? []);
	for (const [name, value] of Object.entries(DEV_MENU_DEFAULTS)) {
		const existing = metaData.find((item) => item?.$?.['android:name'] === name);
		const entry = { 'android:name': name, 'android:value': String(value) };
		if (existing) {
			existing.$ = entry;
		} else {
			metaData.push({ $: entry });
		}
	}
	return manifest;
}

const withQuietDevMenu = (config) => {
	config = withInfoPlist(config, (config) => {
		config.modResults = setInfoPlistDefaults(config.modResults);
		return config;
	});
	return withAndroidManifest(config, (config) => {
		config.modResults = setManifestDefaults(config.modResults);
		return config;
	});
};

module.exports = createRunOncePlugin(withQuietDevMenu, pkg, '0.1.0');
module.exports.DEV_MENU_DEFAULTS = DEV_MENU_DEFAULTS;
module.exports.setInfoPlistDefaults = setInfoPlistDefaults;
module.exports.setManifestDefaults = setManifestDefaults;
