type ElectronBridgeIpcRenderer = {
	invoke(channel: string, args: unknown): Promise<unknown>;
};

function getIpcRenderer(): ElectronBridgeIpcRenderer {
	return (window as unknown as Window & { ipcRenderer: ElectronBridgeIpcRenderer }).ipcRenderer;
}

export async function cleanupOldElectronDatabase(oldDatabaseName: string) {
	await getIpcRenderer().invoke('sqlite', {
		type: 'delete',
		name: oldDatabaseName,
	});
}

export const cleanupOldDatabase = cleanupOldElectronDatabase;
