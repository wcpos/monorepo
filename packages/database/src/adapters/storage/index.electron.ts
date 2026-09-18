import { getRxStorageIpcRenderer } from 'rxdb/plugins/electron';

import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';

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
	const rawStorage = getRxStorageIpcRenderer({
		key: MAIN_STORAGE_KEY,
		mode: 'storage',
		ipcRenderer: getIpcRenderer(),
	});
	// 'raw' here is the IPC client: one round trip to the main process plus the
	// filesystem storage's own work there. Nothing in the renderer can split those two.
	return STORAGE_TIMING_PROBE_ENABLED ? withStorageTimingProbe(rawStorage, 'raw') : rawStorage;
}
