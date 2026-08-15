import { getRxStorageIpcRenderer } from 'rxdb/plugins/electron';

type ElectronBridgeIpcRenderer = {
	invoke(channel: string, args: unknown): Promise<unknown>;
	on(channel: string, listener: (...args: unknown[]) => void): void;
	postMessage(channel: string, message: unknown): void;
	removeListener(channel: string, listener: (...args: unknown[]) => void): void;
};

const MAIN_STORAGE_KEY = 'main-storage';

function getIpcRenderer(): ElectronBridgeIpcRenderer {
	return (window as unknown as Window & { ipcRenderer: ElectronBridgeIpcRenderer }).ipcRenderer;
}

export function getElectronNewStorage() {
	return getRxStorageIpcRenderer({
		key: MAIN_STORAGE_KEY,
		mode: 'storage',
		ipcRenderer: getIpcRenderer(),
	});
}
