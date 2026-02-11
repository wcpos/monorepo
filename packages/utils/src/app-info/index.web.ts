/**
 * Web implementation of AppInfo
 * Gets version from EXPO_PUBLIC_APP_VERSION env var (set in app.config.ts)
 *
 * For web, platformVersion equals version since there's no separate
 * platform-specific version (no App Store/Play Store release).
 */

interface AppInfo {
	/** Cross-platform JS bundle version from Expo config (e.g., '1.8.1') */
	version: string;
	/** Platform-specific version - same as version for web */
	platformVersion: string;
	/** Build number - alias for platformVersion */
	buildNumber: string;
	/** Platform identifier for server communication */
	platform: 'ios' | 'android' | 'web' | 'electron';
	/** User agent string for API requests */
	userAgent: string;
}

const version = process.env.EXPO_PUBLIC_APP_VERSION ?? '0.0.0';

// eslint-disable-next-line @typescript-eslint/no-redeclare
const AppInfo: AppInfo = {
	version,
	platformVersion: version, // Web has no separate platform version
	buildNumber: version, // Alias for backwards compatibility
	platform: 'web',
	userAgent: `WCPOS/${version} (web)`,
};

export { AppInfo };
