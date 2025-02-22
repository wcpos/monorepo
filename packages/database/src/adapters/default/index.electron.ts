import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';

import log from '@wcpos/utils/logger';

import type { SQLiteQueryWithParams } from 'rxdb-premium/plugins/storage-sqlite';

/**
 *
 */
export const storage = getRxStorageSQLite({
	// storeAttachmentsAsBase64String: true,
	sqliteBasics: {
		open: async (name: string) => {
			try {
				const result = await globalThis.ipcRenderer.invoke('sqlite', { type: 'open', name });
				return result;
			} catch (error) {
				log.error(error);
			}
		},
		all: async (db, queryWithParams: SQLiteQueryWithParams) => {
			try {
				const result = await globalThis.ipcRenderer.invoke('sqlite', {
					type: 'all',
					name: db.name,
					sql: queryWithParams,
				});
				return result;
			} catch (error) {
				log.error(error);
			}
		},
		run: async (db, queryWithParams: SQLiteQueryWithParams) => {
			try {
				await globalThis.ipcRenderer.invoke('sqlite', {
					type: 'run',
					name: db.name,
					sql: queryWithParams,
				});
				return db;
			} catch (error) {
				log.error(error);
			}
		},
		setPragma: async (db, r, a) => {
			try {
				await globalThis.ipcRenderer.invoke('sqlite', {
					type: 'run',
					name: db.name,
					sql: { query: 'PRAGMA ' + r + ' = ' + a, params: [] },
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
			} catch (error) {
				log.error(error);
			}
		},
		close: async (db) => {
			try {
				globalThis.ipcRenderer.invoke('sqlite', {
					type: 'close',
					name: db.name,
				});
			} catch (error) {
				log.error(error);
			}
		},
		journalMode: 'WAL2',
	},
});

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultStorage = __DEV__ ? devStorage : storage;
