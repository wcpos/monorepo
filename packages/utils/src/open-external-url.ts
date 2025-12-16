import * as Linking from 'expo-linking';

/**
 * Opens a URL in the system's default external browser.
 *
 * React Native implementation using expo-linking.
 * Platform-specific versions exist for:
 * - .web.ts: Browser (window.open with _blank)
 * - .electron.ts: Electron (IPC to system browser)
 *
 * @param url - The URL to open
 */
export const openExternalURL = async (url: string): Promise<void> => {
	try {
		await Linking.openURL(url);
	} catch (error) {
		console.error('Failed to open URL:', url, error);
	}
};
