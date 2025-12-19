/**
 * Web implementation of AppInfo
 * Uses expo-constants to get version information from app.config.ts
 */
import Constants from 'expo-constants';

export interface AppInfo {
	/** Semantic version (e.g., '1.8.0') */
	version: string;
	/** Build number - not applicable for web, defaults to '0' */
	buildNumber: string;
	/** Platform identifier for server communication */
	platform: 'ios' | 'android' | 'web' | 'electron';
	/** User agent string for API requests */
	userAgent: string;
}

const version = '1.8.1';

const AppInfo: AppInfo = {
	version,
	buildNumber: '0', // Web doesn't have build numbers
	platform: 'web',
	userAgent: `WCPOS/${version} (web)`,
};

export default AppInfo;
