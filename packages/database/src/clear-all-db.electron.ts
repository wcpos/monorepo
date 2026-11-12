import { clearTillAnchor } from './till-anchor.web';

/**
 * The main process wipes the databases; the renderer drops the till anchor so no
 * anchor outlives the database it vouched for.
 *
 * The anchor now waits for 'relaunching': the main process's Yes/No dialog may still
 * be answered No, and a declined clear keeps the database the anchor vouches for.
 */
export const clearAllDB = async () => {
	let answer: unknown;
	try {
		answer = await (window as any).ipcRenderer.invoke('clearData:request');
	} catch {
		// An older shell (no handler, a preload that refuses the channel or has no
		// `invoke`). `send` is fire-and-forget, so the anchor goes first: if the main-process
		// clear fails, the surviving database re-mints its till on the next boot, as a clear asks.
		clearTillAnchor();
		return (window as any).ipcRenderer.send('clearData');
	}
	if (answer === 'relaunching') {
		clearTillAnchor();
		return {
			success: true,
			relaunching: true as const,
			message: 'Clear local data confirmed; relaunching to delete the databases',
		};
	}
	if (answer === 'declined') {
		return {
			success: false,
			declined: true as const,
			message: 'Clear local data declined; the databases and the till are kept',
		};
	}
	throw new Error(`Unexpected answer to clearData:request: ${String(answer)}`);
};
