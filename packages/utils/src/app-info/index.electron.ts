/**
 * Electron implementation of AppInfo
 *
 * - version: The Expo JS bundle version (same as web/native)
 * - platformVersion: The Electron app version from package.json
 */

declare global {
	interface Window {
		electron: {
			basePath: string;
			version: string;
		};
	}
}

interface AppInfo {
	/** Cross-platform JS bundle version from Expo config (e.g., '1.8.1') */
	version: string;
	/** Electron app version from apps/electron/package.json */
	platformVersion: string;
	/** Build number - alias for platformVersion */
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

// Expo bundle version (injected at build time via app.config.ts)
const version = process.env.EXPO_PUBLIC_APP_VERSION ?? '0.0.0';
// Electron app version (from Electron's package.json via preload)
const platformVersion = window.electron?.version ?? '0.0.0';

// eslint-disable-next-line @typescript-eslint/no-redeclare
const AppInfo: AppInfo = {
	version,
	platformVersion,
	buildNumber: platformVersion, // Alias for backwards compatibility
	platform: 'electron',
	userAgent: `WCPOS/${version} (electron ${platformVersion})`,
	userAgentHeader: { 'User-Agent': `WCPOS/${version} (electron ${platformVersion})` },
};

export { AppInfo };
