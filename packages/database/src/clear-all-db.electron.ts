import { clearTillAnchor } from './till-anchor.web';

/**
 * The main process wipes the databases; the renderer drops the till anchor first so
 * no anchor outlives the database it vouched for.
 */
export const clearAllDB = async () => {
	// `send` is fire-and-forget, so the anchor goes first: if the main-process clear
	// fails, the surviving database re-mints its till on the next boot, as a clear asks.
	clearTillAnchor();
	return (window as any).ipcRenderer.send('clearData');
};
