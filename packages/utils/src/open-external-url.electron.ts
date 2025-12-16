/**
 * Opens a URL in the system's default external browser.
 *
 * Electron-specific implementation that uses IPC to open URLs
 * in the system browser (not in-app).
 *
 * @param url - The URL to open
 */
export const openExternalURL = async (url: string): Promise<void> => {
	try {
		if (typeof window !== 'undefined' && (window as any).ipcRenderer) {
			(window as any).ipcRenderer.send('open-external-url', url);
		} else {
			// Fallback to window.open if IPC not available
			window.open(url, '_blank', 'noopener,noreferrer');
		}
	} catch (error) {
		console.error('Failed to open URL:', url, error);
	}
};
