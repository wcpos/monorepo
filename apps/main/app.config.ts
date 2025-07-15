import { ConfigContext, ExpoConfig } from 'expo/config';

// Optional: Access environment variables or other dynamic values
export default ({ config }: ConfigContext): ExpoConfig => ({
	name: 'WooCommerce POS',
	slug: 'wcpos',
	owner: 'wcpos',
	version: '2.0.0',
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
		// baseUrl: '/pos',
		reactCanary: true,
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
