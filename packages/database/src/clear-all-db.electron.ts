import { clearTillAnchor } from './till-anchor.web';

/**
 * The main process wipes the databases; the renderer drops the till anchor first so
 * no anchor outlives the database it vouched for.
 */
export const clearAllDB = async () => {
	clearTillAnchor();
	return (window as any).ipcRenderer.send('clearData');
};
