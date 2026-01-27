import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import type { SQLiteQueryWithParams } from 'rxdb-premium/plugins/storage-sqlite';

const dbLogger = getLogger(['wcpos', 'db', 'adapter']);

// Default timeout for IPC calls (30 seconds)
const IPC_TIMEOUT = 30000;

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
 * Wraps an IPC invoke call with a timeout to prevent infinite hangs.
 * This is important because when the app is backgrounded, IPC can become slow
 * or stalled, and we don't want the renderer to wait forever.
 */
async function invokeWithTimeout<T>(
	channel: string,
	args: unknown,
	timeout = IPC_TIMEOUT
): Promise<T> {
	return Promise.race([
		window.ipcRenderer.invoke(channel, args) as Promise<T>,
		new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error(`IPC call to '${channel}' timed out after ${timeout}ms`)),
				timeout
			)
		),
	]);
}

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
				dbLogger.error('Failed to open SQLite database', {
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.CONNECTION_FAILED,
						databaseName: name,
						error: error.message,
					},
				});
				// Throw a serializable error object
				throw { message: error.message, stack: error.stack };
			}
		},
		all: async (db, queryWithParams: SQLiteQueryWithParams) => {
			try {
				await waitForIpcRenderer;
				const result = await invokeWithTimeout('sqlite', {
					type: 'all',
					name: db.name,
					sql: queryWithParams,
				});
				if (result === undefined) {
					throw new Error(`No result returned for all query`);
				}
				return result;
			} catch (error: any) {
				const isTimeout = error.message?.includes('timed out');
				dbLogger.error(isTimeout ? 'SQLite query timed out' : 'Failed to execute SQLite query', {
					saveToDb: true,
					context: {
						errorCode: isTimeout ? ERROR_CODES.QUERY_TIMEOUT : ERROR_CODES.QUERY_SYNTAX_ERROR,
						databaseName: db.name,
						error: error.message,
					},
				});
				throw { message: error.message, stack: error.stack };
			}
		},
		run: async (db, queryWithParams: SQLiteQueryWithParams) => {
			try {
				await waitForIpcRenderer;
				await invokeWithTimeout('sqlite', {
					type: 'run',
					name: db.name,
					sql: queryWithParams,
				});
				// Return db to keep the promise chain consistent
				return db;
			} catch (error: any) {
				const isTimeout = error.message?.includes('timed out');
				dbLogger.error(isTimeout ? 'SQLite command timed out' : 'Failed to run SQLite command', {
					saveToDb: true,
					context: {
						errorCode: isTimeout ? ERROR_CODES.QUERY_TIMEOUT : ERROR_CODES.QUERY_SYNTAX_ERROR,
						databaseName: db.name,
						error: error.message,
					},
				});
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
				dbLogger.error('Failed to set SQLite pragma', {
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.QUERY_SYNTAX_ERROR,
						databaseName: db.name,
						pragma,
						value,
						error: error.message,
					},
				});
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
				dbLogger.error('Failed to close SQLite database', {
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.CONNECTION_FAILED,
						databaseName: db.name,
						error: error.message,
					},
				});
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
	ignoreDuplicate: !!__DEV__,
};
