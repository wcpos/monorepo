import { ConfigContext, ExpoConfig } from 'expo/config';

// Optional: Access environment variables or other dynamic values
export default ({ config }: ConfigContext): ExpoConfig => ({
	name: 'WooCommerce POS',
	slug: 'wcpos',
	owner: 'wcpos',
	version: '1.8.0',
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
		supportsTablet: true,
		bundleIdentifier: 'com.wcpos.main',
		buildNumber: '1',
		infoPlist: {
			ITSAppUsesNonExemptEncryption: false,
		},
		jsEngine: 'hermes',
	},
	android: {
		adaptiveIcon: {
			foregroundImage: './assets/images/adaptive-icon.png',
			backgroundColor: '#ffffff',
		},
		package: 'com.wcpos.main',
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
		// Use environment variable for baseUrl if provided (for web bundle builds)
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
});
