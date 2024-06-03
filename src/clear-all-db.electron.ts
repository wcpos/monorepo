/**
 *
 */
export const clearAllDB = async () => {
	return window.ipcRenderer.send('clearData');
};
