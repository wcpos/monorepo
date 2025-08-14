import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
	const easProfile = process.env.EAS_BUILD_PROFILE ?? 'production';

	const isDev = easProfile === 'development';
	const isAdhoc = easProfile === 'adhoc';
	const isProd = easProfile === 'production';

	return {
		...config,
		name: 'WCPOS - Point of Sale for WooCommerce',
		slug: 'wcpos',
		owner: 'wcpos',
		version: '1.8.0', // manual user-facing version

		orientation: 'default',
		icon: './assets/images/icon.png',
		scheme: 'wcpos',
		userInterfaceStyle: 'automatic',
		newArchEnabled: true,

		splash: {
			image: './assets/images/splash-icon.png',
			resizeMode: 'contain',
			backgroundColor: '#F0F4F8',
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
				...config.ios?.infoPlist,
				ITSAppUsesNonExemptEncryption: false,
			},
			jsEngine: 'hermes',
		},

		android: {
			...config.android,
			adaptiveIcon: {
				foregroundImage: './assets/images/adaptive-icon.png',
				backgroundColor: '#ffffff',
			},
			package: isDev ? 'com.wcpos.main.dev' : isAdhoc ? 'com.wcpos.main.adhoc' : 'com.wcpos.main',
			versionCode: 1,
			jsEngine: 'hermes',
		},

		web: {
			bundler: 'metro',
			output: 'single',
			favicon: './assets/images/favicon.png',
		},

		plugins: [
			'expo-sqlite',
			[
				'expo-router',
				{
					sitemap: false,
				},
			],
			[
				'expo-splash-screen',
				{
					backgroundColor: '#F0F4F8',
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
			reactCanary: true,
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
