const NOVU_APP_IDS = {
	production: 'Wu5i9hEUNMO2',
	development: '64qzhASJJNnb',
} as const;

export type NovuEnvironment = 'development' | 'production';

export function getNovuEnvironment(): NovuEnvironment {
	const override = process.env.EXPO_PUBLIC_NOVU_ENV || process.env.NOVU_ENV;
	if (override === 'development' || override === 'production') return override;

	if (typeof __DEV__ !== 'undefined') {
		return __DEV__ ? 'development' : 'production';
	}

	return process.env.NODE_ENV === 'development' ? 'development' : 'production';
}

export const NOVU_CONFIG = {
	get applicationIdentifier() {
		return NOVU_APP_IDS[getNovuEnvironment()];
	},
	apiUrl:
		process.env.EXPO_PUBLIC_NOVU_API_URL ||
		process.env.NOVU_API_URL ||
		'https://api.notifications.wcpos.com',
	socketUrl:
		process.env.EXPO_PUBLIC_NOVU_SOCKET_URL ||
		process.env.NOVU_SOCKET_URL ||
		'wss://ws.notifications.wcpos.com',
};
