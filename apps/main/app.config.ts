import { ConfigContext, ExpoConfig } from 'expo/config';

import packageJson from './package.json';

/**
 * Native version stamped into the `development`-profile dev client. FROZEN on
 * purpose: `version` feeds the EAS fingerprint, so a release-only package bump
 * would otherwise miss the shared dev-client cache and cost a build ($2 iOS /
 * $1 Android) for a client whose JS comes from Metro anyway. Move it only when
 * a native change forces a new dev-client build regardless.
 */
const DEV_CLIENT_NATIVE_VERSION = '1.10.4';

export default ({ config }: ConfigContext): ExpoConfig => {
	const easProfile = process.env.EAS_BUILD_PROFILE ?? 'production';
	const iosInfoPlist = config.ios?.infoPlist ?? {};
	const bonjourServices = Array.isArray(iosInfoPlist.NSBonjourServices)
		? iosInfoPlist.NSBonjourServices
		: [];
	const externalAccessoryProtocols = Array.isArray(
		iosInfoPlist.UISupportedExternalAccessoryProtocols
	)
		? iosInfoPlist.UISupportedExternalAccessoryProtocols
		: [];

	// The former `e2e-test` profile is gone: native E2E drives the same
	// `development`-profile dev client developers use, with Metro serving the
	// JS (e2e-native.yml, 2026-08-28).
	const isDev = easProfile === 'development';
	const isAdhoc = easProfile === 'adhoc';

	// Set env var for web builds (used by @wcpos/utils/app-info)
	process.env.EXPO_PUBLIC_APP_VERSION = packageJson.version;

	return {
		...config,
		name: 'WCPOS',
		slug: 'wcpos',
		owner: 'wcpos',
		// Metro serves the checked-out JS to dev clients, so release-only package
		// bumps must keep using the native metadata already cached by EAS.
		version: isDev ? DEV_CLIENT_NATIVE_VERSION : packageJson.version,

		orientation: 'default',
		icon: './assets/images/icon.png',
		// One URL scheme per build profile, mirroring the bundle ids below. The
		// login redirect returns through this scheme; when two variants share
		// one, Android shows a chooser and iOS picks an arbitrary app (Apple
		// documents it as undefined). The plugin's redirect_uri allow-list
		// (includes/Templates/Auth.php) must accept every scheme listed here.
		// The dev-client deep link matches on host, so
		// `wcpos-dev://expo-development-client/?url=…` works unchanged.
		scheme: isDev ? 'wcpos-dev' : isAdhoc ? 'wcpos-adhoc' : 'wcpos',
		userInterfaceStyle: 'automatic',

		ios: {
			...config.ios,
			supportsTablet: true,
			bundleIdentifier: isDev
				? 'com.wcpos.main.dev'
				: isAdhoc
					? 'com.wcpos.main.adhoc'
					: 'com.wcpos.main',
			buildNumber: '1',
			infoPlist: {
				...iosInfoPlist,
				ITSAppUsesNonExemptEncryption: false,
				// Keep in step with the react-native-ble-plx plugin entry below — the
				// plugin's withInfoPlist mod runs after this static merge, so both must
				// carry the same combined readers+printers+scanners wording.
				NSBluetoothAlwaysUsageDescription:
					iosInfoPlist.NSBluetoothAlwaysUsageDescription ??
					'WCPOS uses Bluetooth to connect card readers, supported barcode scanners and receipt printers.',
				// Local network access for printer discovery
				NSLocalNetworkUsageDescription:
					iosInfoPlist.NSLocalNetworkUsageDescription ??
					'WCPOS uses the local network to connect card readers and receipt printers.',
				// Bonjour services for printer discovery
				NSBonjourServices: Array.from(
					new Set([...bonjourServices, '_ipp._tcp', '_ipps._tcp', '_pdl-datastream._tcp'])
				),
				UISupportedExternalAccessoryProtocols: Array.from(
					new Set([...externalAccessoryProtocols, 'jp.star-m.starpro', 'com.epson.escpos'])
				),
			},
		},

		android: {
			...config.android,
			adaptiveIcon: {
				foregroundImage: './assets/images/adaptive-icon.png',
				backgroundColor: '#ffffff',
			},
			package: isDev ? 'com.wcpos.main.dev' : isAdhoc ? 'com.wcpos.main.adhoc' : 'com.wcpos.main',
			versionCode: 1,
			permissions: [
				...new Set([
					...(config.android?.permissions ?? []),
					'android.permission.ACCESS_COARSE_LOCATION',
					'android.permission.ACCESS_FINE_LOCATION',
					'android.permission.BLUETOOTH',
					'android.permission.BLUETOOTH_ADMIN',
					'android.permission.BLUETOOTH_CONNECT',
					'android.permission.BLUETOOTH_SCAN',
					'android.permission.INTERNET',
				]),
			],
		},

		web: {
			bundler: 'metro',
			output: 'single',
			favicon: './assets/images/favicon.png',
		},

		plugins: [
			// Pinned to 8.25.0 over Expo SDK 57's ~7.11.0 (excluded from `expo install`
			// checks in package.json): only 8.25.0 carries the fix for
			// getsentry/sentry-react-native#6630 — on Expo 57 / RN 0.86 iOS, envelopes
			// report HTTP 200 but never ingest. The 7.x line ended 2026-02-12.
			// Source maps and debug symbols upload during the STORE build's native
			// Release step, authenticated by the SENTRY_AUTH_TOKEN EAS environment
			// variable (an organization token, `org:ci`, on `production` only).
			// sentry-xcode.sh FAILS a Release build when that upload fails, so every
			// other profile — dev client, ad-hoc, the reusable `monorepo` base — never
			// attempts it. No profile means production (`easProfile` above), so a local
			// Release build of the store binary uploads too and needs the token in its
			// shell; a missing or revoked token there is a red build, not a silent gap.
			// Uploads are keyed <applicationId>@<version>+<build>, which is why
			// sentry-sink.native.ts lets the SDK derive release/dist.
			[
				'@sentry/react-native/expo',
				{
					organization: 'wcpos',
					project: 'woocommerce-pos',
					disableAutoUpload: easProfile !== 'production',
				},
			],
			// Expo 57 already supplies compile/target SDK >= 35; only the minimum must move.
			['expo-build-properties', { android: { minSdkVersion: 26 } }],
			[
				'@stripe/stripe-terminal-react-native',
				{
					bluetoothBackgroundMode: true,
					locationWhenInUsePermission:
						'WCPOS uses your location to connect card readers and accept payments.',
					bluetoothPeripheralPermission: 'WCPOS uses Bluetooth to connect card readers.',
					bluetoothAlwaysUsagePermission:
						'WCPOS uses Bluetooth to connect card readers, supported barcode scanners and receipt printers.',
					localNetworkUsagePermission:
						'WCPOS uses the local network to connect card readers and receipt printers.',
				},
			],
			'./plugins/with-printer-support',
			'./plugins/with-wedge-key-events',
			'./plugins/with-sumup-reader',
			[
				'@config-plugins/react-native-webrtc',
				{
					// WebRTC requires native declarations; the app never opens the camera or microphone.
					cameraPermission: 'WCPOS does not use the camera.',
					microphonePermission: 'WCPOS does not use the microphone.',
				},
			],
			// Android trusts user-installed CAs on dev/adhoc builds ONLY (ruling
			// 2026-08-21, #1415): self-signed/enterprise dev stores become testable
			// on-device; production keeps the platform default (system CAs only).
			...(isDev || isAdhoc ? ['./plugins/with-user-ca-trust'] : []),
			// The dev client's dev-menu overlays (floating button, menu-at-launch,
			// onboarding card) are switched off by default on the development
			// profile — the build the native E2E suite drives (2026-08-29). The
			// menu itself remains reachable and the defaults can be re-enabled in
			// its settings; see the plugin.
			...(isDev ? ['./plugins/with-quiet-dev-menu'] : []),
			[
				'expo-camera',
				{
					cameraPermission: 'WCPOS uses the camera to scan product barcodes.',
					recordAudioAndroid: false,
				},
			],
			[
				'react-native-ble-plx',
				{
					// iOS app-mode scanning for supported BLE barcode scanners (#1461).
					// Scanner discovery is foreground-only; Stripe enables background Bluetooth.
					// This overwrites the
					// static infoPlist NSBluetoothAlwaysUsageDescription above at prebuild;
					// both carry the same combined readers+printers+scanners wording.
					bluetoothAlwaysPermission:
						'WCPOS uses Bluetooth to connect card readers, supported barcode scanners and receipt printers.',
				},
			],
			[
				'expo-router',
				{
					sitemap: false,
				},
			],
			[
				'expo-splash-screen',
				{
					backgroundColor: '#F0F6FD',
					image: './assets/images/splash-icon.png',
					// dark: {
					// 	image: './assets/splash-icon-dark.png',
					// 	backgroundColor: '#000000',
					// },
					imageWidth: 120,
				},
			],
			[
				'react-native-edge-to-edge',
				{
					android: {
						parentTheme: 'Default',
						enforceNavigationBarContrast: false,
					},
				},
			],
			'expo-image',
			'expo-localization',
			'expo-web-browser',
		],

		experiments: {
			typedRoutes: true,
			reactCompiler: true,
			...(process.env.WCPOS_BASEURL_PLACEHOLDER && {
				baseUrl: process.env.WCPOS_BASEURL_PLACEHOLDER,
			}),
		},

		extra: {
			router: {
				origin: false,
			},
			eas: {
				projectId: 'eb1b6e66-92d7-47f5-b93f-95bf51287f60',
			},
		},
	};
};
