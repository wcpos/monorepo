import * as Linking from 'expo-linking';

/**
 * Opens a URL in the system's default external browser.
 *
 * For Electron: Opens in the system browser (not in-app)
 * For Web/Native: Uses standard Linking.openURL
 *
 * @param url - The URL to open
 */
export const openExternalURL = async (url: string): Promise<void> => {
	try {
		// Check if running in Electron
		if (typeof window !== 'undefined' && (window as any).ipcRenderer) {
			// Use IPC to open in system browser (Electron)
			(window as any).ipcRenderer.send('open-external-url', url);
		} else {
			// Use standard Linking for web/native
			await Linking.openURL(url);
		}
	} catch (error) {
		console.error('Failed to open URL:', url, error);
	}
};
