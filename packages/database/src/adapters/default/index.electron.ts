import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';

import log from '@wcpos/utils/logger';

import type { SQLiteQueryWithParams } from 'rxdb-premium/plugins/storage-sqlite';

/**
 * Returns a promise that resolves when window.ipcRenderer is available.
 * This implementation continuously polls without a timeout.
 */
const waitForIpcRenderer = new Promise<void>((resolve) => {
	const interval = 50;
	const check = () => {
		if (typeof window !== 'undefined' && window.ipcRenderer) {
			resolve();
		} else {
			setTimeout(check, interval);
		}
	};
	check();
});

/**
 * The sqliteBasics configuration for RxDB using IPC in Electron.
 * Each method is implemented via an IPC call to the main process.
 * Errors are caught, logged, and then rethrown as plain objects
 * so that they can cross the IPC boundary (i.e. be serializable).
 */
export const storage = getRxStorageSQLite({
	// Optionally, storeAttachmentsAsBase64String: true,
	sqliteBasics: {
		open: async (name: string) => {
			try {
				await waitForIpcRenderer;
				const result = await window.ipcRenderer.invoke('sqlite', { type: 'open', name });
				if (!result) {
					throw new Error(`No result returned for open: ${name}`);
				}
				return result;
			} catch (error: any) {
				log.error(error);
				// Throw a serializable error object
				throw { message: error.message, stack: error.stack };
			}
		},
		all: async (db, queryWithParams: SQLiteQueryWithParams) => {
			try {
				await waitForIpcRenderer;
				const result = await window.ipcRenderer.invoke('sqlite', {
					type: 'all',
					name: db.name,
					sql: queryWithParams,
				});
				if (result === undefined) {
					throw new Error(`No result returned for all query`);
				}
				return result;
			} catch (error: any) {
				log.error(error);
				throw { message: error.message, stack: error.stack };
			}
		},
		run: async (db, queryWithParams: SQLiteQueryWithParams) => {
			try {
				await waitForIpcRenderer;
				await window.ipcRenderer.invoke('sqlite', {
					type: 'run',
					name: db.name,
					sql: queryWithParams,
				});
				// Return db to keep the promise chain consistent
				return db;
			} catch (error: any) {
				log.error(error);
				throw { message: error.message, stack: error.stack };
			}
		},
		setPragma: async (db, pragma, value) => {
			try {
				await waitForIpcRenderer;
				await window.ipcRenderer.invoke('sqlite', {
					type: 'run',
					name: db.name,
					sql: { query: 'PRAGMA ' + pragma + ' = ' + value, params: [] },
					context: {
						method: 'setPragma',
						data: {
							pragmaName: 'journal_mode',
							pragmaValue: 'WAL',
							description:
								'Sets the SQLite journal mode to Write-Ahead Logging for better concurrency.',
						},
					},
				});
				return db;
			} catch (error: any) {
				log.error(error);
				throw { message: error.message, stack: error.stack };
			}
		},
		close: async (db) => {
			try {
				await waitForIpcRenderer;
				const result = await window.ipcRenderer.invoke('sqlite', {
					type: 'close',
					name: db.name,
				});
				return result; // Return the result from the close IPC call
			} catch (error: any) {
				log.error(error);
				throw { message: error.message, stack: error.stack };
			}
		},
		journalMode: 'WAL2',
	},
});

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	multiInstance: false, // False for single page electron app
};
