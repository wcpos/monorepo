/**
 * Native (iOS/Android) implementation of AppInfo
 * Uses expo-constants to get version information from app.config.ts
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface AppInfo {
	/** Semantic version (e.g., '1.8.0') */
	version: string;
	/** Build number (iOS) or version code (Android) */
	buildNumber: string;
	/** Platform identifier for server communication */
	platform: 'ios' | 'android' | 'web' | 'electron';
	/** User agent string for API requests */
	userAgent: string;
}

const version = Constants.expoConfig?.version ?? '0.0.0';
const buildNumber =
	Platform.OS === 'ios'
		? (Constants.expoConfig?.ios?.buildNumber ?? '0')
		: String(Constants.expoConfig?.android?.versionCode ?? 0);

const AppInfo: AppInfo = {
	version,
	buildNumber,
	platform: Platform.OS as 'ios' | 'android',
	userAgent: `WCPOS/${version} (${Platform.OS}; build ${buildNumber})`,
};

export default AppInfo;
