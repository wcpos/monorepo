/**
 * Opens a URL in a new browser tab.
 *
 * Web-specific implementation that ensures URLs open in a new tab
 * using window.open with target="_blank".
 *
 * @param url - The URL to open
 */
export const openExternalURL = async (url: string): Promise<void> => {
	try {
		// Open in new tab with security best practices
		window.open(url, '_blank', 'noopener,noreferrer');
	} catch (error) {
		console.error('Failed to open URL:', url, error);
	}
};
