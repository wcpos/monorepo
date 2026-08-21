/**
 * Native (iOS/Android) implementation of AppInfo
 * Uses expo-constants to get version information from app.config.ts
 */
import { Platform } from 'react-native';

import Constants from 'expo-constants';

interface AppInfo {
	/** Cross-platform JS bundle version from Expo config (e.g., '1.8.1') */
	version: string;
	/** Platform-specific version (build number for iOS, version code for Android) */
	platformVersion: string;
	/** Build number (iOS) or version code (Android) - alias for platformVersion */
	buildNumber: string;
	/** Platform identifier for server communication */
	platform: 'ios' | 'android' | 'web' | 'electron';
	/** User agent string for API requests */
	userAgent: string;
	/**
	 * The User-Agent header this platform should stamp on WCPOS requests, as a
	 * spreadable header fragment. Empty on web: browsers that honour fetch UA
	 * overrides (Firefox) would REPLACE the battle-tested browser UA with a
	 * product string that reads as a bot to WAF heuristics — on web the browser
	 * UA is the safe one. Native and Electron stamp the explicit product UA
	 * (B10, wcpos-infra#72): a blank or library UA on a POST earns AIOS bans.
	 */
	userAgentHeader: Record<string, string>;
}

const version = Constants.expoConfig?.version ?? '0.0.0';
const platformVersion =
	Platform.OS === 'ios'
		? (Constants.expoConfig?.ios?.buildNumber ?? '0')
		: String(Constants.expoConfig?.android?.versionCode ?? 0);

// eslint-disable-next-line @typescript-eslint/no-redeclare
const AppInfo: AppInfo = {
	version,
	platformVersion,
	buildNumber: platformVersion, // Alias for backwards compatibility
	platform: Platform.OS as 'ios' | 'android',
	userAgent: `WCPOS/${version} (${Platform.OS}; build ${platformVersion})`,
	userAgentHeader: { 'User-Agent': `WCPOS/${version} (${Platform.OS}; build ${platformVersion})` },
};

export { AppInfo };
