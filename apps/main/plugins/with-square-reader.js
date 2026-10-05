// SPIKE (roadmap#115 amendment, 2026-10-05): does Square's Mobile Payments SDK build in the
// same binary as Stripe Terminal and SumUp? Adapted from Square's own Expo sample plugin
// (square/mobile-payments-sdk-react-native example-expo/app.plugin.js at 2026.8.1), minus the
// sample app's credentials, fonts and vector icons. Not for merge.
const fs = require('fs');
const path = require('path');

const {
	createRunOncePlugin,
	withAndroidManifest,
	withAppDelegate,
	withDangerousMod,
	withGradleProperties,
	withInfoPlist,
	withMainApplication,
	withProjectBuildGradle,
} = require('@expo/config-plugins');

// Square wants its application ID at process start on both platforms. A placeholder is enough
// to prove the compile; a real driver would carry WCPOS's own Square application ID here.
const SQUARE_APPLICATION_ID = 'sandbox-sq0idb-spike-placeholder';

const ANDROID_PERMISSIONS = [
	'android.permission.ACCESS_FINE_LOCATION',
	'android.permission.RECORD_AUDIO',
	'android.permission.BLUETOOTH_CONNECT',
	'android.permission.BLUETOOTH_SCAN',
	'android.permission.READ_PHONE_STATE',
];
const ACCESSORY_PROTOCOLS = [
	'com.squareup.protocol.stand',
	'com.squareup.s089',
	'com.squareup.s025',
	'com.squareup.s020',
];

const KOTLIN_METADATA_FLAG = `
    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
        compilerOptions {
            freeCompilerArgs.add("-Xskip-metadata-version-check")
        }
    }`;

const PODFILE_SETUP_PHASE = `
def add_square_setup_build_phase(installer)
  phase_name = '[SquareMobilePaymentsSDK] setup'
  script = <<-'SCRIPT'
SETUP_SCRIPT="\${BUILT_PRODUCTS_DIR}/\${FRAMEWORKS_FOLDER_PATH}/SquareMobilePaymentsSDK.framework/setup"
if [ -f "$SETUP_SCRIPT" ]; then
  "$SETUP_SCRIPT"
fi
SCRIPT

  installer.aggregate_targets.each do |aggregate_target|
    user_project = aggregate_target.user_project
    next unless user_project

    user_project.native_targets.each do |native_target|
      next unless native_target.product_type == 'com.apple.product-type.application'

      existing_phase = native_target.shell_script_build_phases.find { |phase| phase.name == phase_name }
      existing_phase&.remove_from_project

      phase = native_target.new_shell_script_build_phase(phase_name)
      phase.shell_script = script
      phase.always_out_of_date = '1'
    end

    user_project.save
  end
end
`;

function withSquareReader(config) {
	config = withProjectBuildGradle(config, (mod) => {
		let contents = mod.modResults.contents;
		if (!contents.includes('sdk.squareup.com/public/android')) {
			contents = contents.replace(
				/allprojects\s*\{\s*repositories\s*\{/,
				(match) => `${match}\n    maven { url 'https://sdk.squareup.com/public/android/' }`
			);
		}
		if (!contents.includes('-Xskip-metadata-version-check')) {
			// Its own block at the end: writing inside the existing `allprojects {` would break
			// with-sumup-reader's `allprojects { repositories {` match.
			contents += `\nallprojects {${KOTLIN_METADATA_FLAG}\n}\n`;
		}
		mod.modResults.contents = contents;
		return mod;
	});
	config = withMainApplication(config, (mod) => {
		let contents = mod.modResults.contents;
		if (!contents.includes('MobilePaymentsSdk.initialize')) {
			contents = contents.replace(
				/package [\w.]+/,
				(match) => `${match}\n\nimport com.squareup.sdk.mobilepayments.MobilePaymentsSdk`
			);
			if (!/super\.onCreate\(\)/.test(contents))
				throw new Error('with-square-reader: no super.onCreate() in MainApplication');
			contents = contents.replace(
				/super\.onCreate\(\)/,
				(match) => `${match}\n    MobilePaymentsSdk.initialize("${SQUARE_APPLICATION_ID}", this)`
			);
		}
		mod.modResults.contents = contents;
		return mod;
	});
	config = withAndroidManifest(config, (mod) => {
		const permissions = (mod.modResults.manifest['uses-permission'] ??= []);
		for (const name of ANDROID_PERMISSIONS) {
			if (!permissions.some((permission) => permission.$?.['android:name'] === name))
				permissions.push({ $: { 'android:name': name } });
		}
		return mod;
	});
	config = withGradleProperties(config, (mod) => {
		const key = 'android.packagingOptions.pickFirsts';
		const value = 'META-INF/versions/9/OSGI-INF/MANIFEST.MF';
		const existing = mod.modResults.find((item) => item.key === key);
		if (!existing) mod.modResults.push({ type: 'property', key, value });
		else if (!existing.value.includes(value)) existing.value += `,${value}`;
		return mod;
	});
	config = withInfoPlist(config, (mod) => {
		const plist = mod.modResults;
		plist.UISupportedExternalAccessoryProtocols ??= [];
		for (const protocol of ACCESSORY_PROTOCOLS) {
			if (!plist.UISupportedExternalAccessoryProtocols.includes(protocol))
				plist.UISupportedExternalAccessoryProtocols.push(protocol);
		}
		plist.APP_ID = SQUARE_APPLICATION_ID;
		return mod;
	});
	config = withAppDelegate(config, (mod) => {
		let contents = mod.modResults.contents;
		if (mod.modResults.language !== 'swift')
			throw new Error('with-square-reader: expected a Swift AppDelegate');
		if (!contents.includes('import SquareMobilePaymentsSDK'))
			contents = `import SquareMobilePaymentsSDK\n${contents}`;
		if (!contents.includes('MobilePaymentsSDK.initialize')) {
			if (!/didFinishLaunchingWithOptions[^{]*\{/.test(contents))
				throw new Error('with-square-reader: no didFinishLaunchingWithOptions in AppDelegate');
			contents = contents.replace(
				/didFinishLaunchingWithOptions[^{]*\{/,
				(match) => `${match}
    MobilePaymentsSDK.initialize(
      applicationLaunchOptions: launchOptions,
      squareApplicationID: Bundle.main.object(forInfoDictionaryKey: "APP_ID") as! String
    )
`
			);
		}
		mod.modResults.contents = contents;
		return mod;
	});
	return withDangerousMod(config, [
		'ios',
		async (mod) => {
			const podfilePath = path.join(mod.modRequest.platformProjectRoot, 'Podfile');
			let contents = fs.readFileSync(podfilePath, 'utf8');
			if (!contents.includes('def add_square_setup_build_phase')) {
				if (!contents.includes('prepare_react_native_project!'))
					throw new Error('with-square-reader: no prepare_react_native_project! in Podfile');
				contents = contents.replace(
					'prepare_react_native_project!',
					`${PODFILE_SETUP_PHASE}\nprepare_react_native_project!`
				);
			}
			// Square's sample plugin adds the phase from post_install, which runs BEFORE CocoaPods
			// adds "[CP] Embed Pods Frameworks" to the app target. The setup script then runs
			// first, finds no SDK in the app, and leaves SquareReader / LCRCore / CorePaymentCard
			// nested, so the app dies in dyld at launch (EAS build 6c5f6a7a, 2026-10-05).
			// post_integrate runs after the user project is integrated, so the phase lands last.
			// NOT yet proven by a build: only the hand-repackaged app has been launched.
			if (!/^\s*add_square_setup_build_phase\(installer\)/m.test(contents)) {
				contents += `\npost_integrate do |installer|\n  add_square_setup_build_phase(installer)\nend\n`;
			}
			fs.writeFileSync(podfilePath, contents);
			return mod;
		},
	]);
}

module.exports = createRunOncePlugin(withSquareReader, 'with-square-reader', '0.0.0-spike');
