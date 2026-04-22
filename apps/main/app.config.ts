import { ConfigContext, ExpoConfig } from 'expo/config';

import packageJson from './package.json';

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

	const isDev = easProfile === 'development';
	const isAdhoc = easProfile === 'adhoc';

	// Set env var for web builds (used by @wcpos/utils/app-info)
	process.env.EXPO_PUBLIC_APP_VERSION = packageJson.version;

	return {
		...config,
		name: 'WCPOS',
		slug: 'wcpos',
		owner: 'wcpos',
		version: packageJson.version,

		orientation: 'default',
		icon: './assets/images/icon.png',
		scheme: 'wcpos',
		userInterfaceStyle: 'automatic',

		splash: {
			image: './assets/images/splash-icon.png',
			resizeMode: 'contain',
			backgroundColor: '#F0F6FD',
		},

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
				NSBluetoothAlwaysUsageDescription:
					iosInfoPlist.NSBluetoothAlwaysUsageDescription ??
					'WCPOS uses Bluetooth to discover and connect to supported receipt printers.',
				// Local network access for printer discovery
				NSLocalNetworkUsageDescription:
					iosInfoPlist.NSLocalNetworkUsageDescription ??
					'WCPOS needs local network access to discover and connect to receipt printers.',
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
			'./plugins/with-printer-support',
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
