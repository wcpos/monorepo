/**
 * Electron implementation of AppInfo
 * Gets version from the Electron main process via preload script
 */

declare global {
	interface Window {
		electron: {
			basePath: string;
			version: string;
		};
	}
}

export interface AppInfo {
	/** Semantic version (e.g., '1.8.0') */
	version: string;
	/** Build number - same as version for Electron */
	buildNumber: string;
	/** Platform identifier for server communication */
	platform: 'ios' | 'android' | 'web' | 'electron';
	/** User agent string for API requests */
	userAgent: string;
}

const version = window.electron?.version ?? '0.0.0';

const AppInfo: AppInfo = {
	version,
	buildNumber: version, // Electron uses same value for both
	platform: 'electron',
	userAgent: `WCPOS/${version} (electron)`,
};

export default AppInfo;
