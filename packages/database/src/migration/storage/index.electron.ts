import { getRxStorageIpcRenderer } from 'rxdb/plugins/electron';
import { getRxStorageSQLite } from 'rxdb-premium-old/plugins/storage-sqlite';

import type {
	SQLiteBasics,
	SQLiteQueryWithParams,
	SQLResultRow,
} from 'rxdb-premium-old/plugins/storage-sqlite';

type ElectronBridgeIpcRenderer = {
	invoke(channel: string, args: unknown): Promise<unknown>;
	on(channel: string, listener: (...args: unknown[]) => void): void;
	postMessage(channel: string, message: unknown): void;
	removeListener(channel: string, listener: (...args: unknown[]) => void): void;
};

type ElectronLegacyDatabase = {
	name: string;
};

const SQLITE_CHANNEL = 'sqlite';
const MAIN_STORAGE_KEY = 'main-storage';
const IPC_TIMEOUT = 30000;

function getIpcRenderer(): ElectronBridgeIpcRenderer {
	return (window as unknown as Window & { ipcRenderer: ElectronBridgeIpcRenderer }).ipcRenderer;
}

const waitForIpcRenderer = new Promise<void>((resolve) => {
	const interval = 50;
	const check = () => {
		if (typeof window !== 'undefined' && getIpcRenderer()) {
			resolve();
		} else {
			setTimeout(check, interval);
		}
	};
	check();
});

async function invokeWithTimeout<T>(
	channel: string,
	args: unknown,
	timeout = IPC_TIMEOUT
): Promise<T> {
	return Promise.race([
		getIpcRenderer().invoke(channel, args) as Promise<T>,
		new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error(`IPC call to '${channel}' timed out after ${timeout}ms`)),
				timeout
			)
		),
	]);
}

function getSQLiteIpcBasics(): SQLiteBasics<ElectronLegacyDatabase> {
	return {
		open: async (name: string) => {
			await waitForIpcRenderer;
			const result = await getIpcRenderer().invoke(SQLITE_CHANNEL, {
				type: 'open',
				name,
			});
			if (!result) {
				throw new Error(`No result returned for open: ${name}`);
			}
			return result as ElectronLegacyDatabase;
		},
		all: async (db: ElectronLegacyDatabase, queryWithParams: SQLiteQueryWithParams) => {
			await waitForIpcRenderer;
			const result = await invokeWithTimeout<SQLResultRow[]>(SQLITE_CHANNEL, {
				type: 'all',
				name: db.name,
				sql: queryWithParams,
			});
			if (result === undefined) {
				throw new Error('No result returned for all query');
			}
			return result;
		},
		run: async (db: ElectronLegacyDatabase, queryWithParams: SQLiteQueryWithParams) => {
			await waitForIpcRenderer;
			await invokeWithTimeout<void>(SQLITE_CHANNEL, {
				type: 'run',
				name: db.name,
				sql: queryWithParams,
			});
		},
		setPragma: async (db: ElectronLegacyDatabase, pragma: string, value: string) => {
			await waitForIpcRenderer;
			await getIpcRenderer().invoke(SQLITE_CHANNEL, {
				type: 'run',
				name: db.name,
				sql: { query: 'PRAGMA ' + pragma + ' = ' + value, params: [] },
			});
		},
		close: async (db: ElectronLegacyDatabase) => {
			await waitForIpcRenderer;
			await getIpcRenderer().invoke(SQLITE_CHANNEL, {
				type: 'close',
				name: db.name,
			});
		},
		journalMode: 'WAL2',
	};
}

export function getElectronOldStorage() {
	return getRxStorageSQLite({
		sqliteBasics: getSQLiteIpcBasics(),
	});
}

export function getElectronNewStorage() {
	return getRxStorageIpcRenderer({
		key: MAIN_STORAGE_KEY,
		mode: 'storage',
		ipcRenderer: getIpcRenderer(),
	});
}

export function getStorageMigrationConfig() {
	return {
		oldStorage: getElectronOldStorage(),
		sourceStorage: 'sqlite-ipc',
		targetStorage: 'filesystem-node-ipc',
	};
}
