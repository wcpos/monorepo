/**
 *
 */
export const clearAllDB = async () => {
	return (window as any).ipcRenderer.send('clearData');
};
