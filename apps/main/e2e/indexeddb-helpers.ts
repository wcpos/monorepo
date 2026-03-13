import type { Page } from '@playwright/test';

/**
 * Full snapshot of all IndexedDB databases, including schema metadata.
 *
 * Structure:
 *   { [dbName]: { version, stores: { [storeName]: { keyPath, autoIncrement, indexes, records } } } }
 */
export interface IndexedDBSnapshot {
	[dbName: string]: {
		version: number;
		stores: {
			[storeName: string]: {
				keyPath: string | string[] | null;
				autoIncrement: boolean;
				indexes: {
					name: string;
					keyPath: string | string[];
					unique: boolean;
					multiEntry: boolean;
				}[];
				records: any[];
			};
		};
	};
}

/**
 * Saved auth state for a store variant (IndexedDB + localStorage).
 */
export interface SavedAuthState {
	indexedDB: IndexedDBSnapshot;
	localStorage: Record<string, string>;
}

/**
 * Restore an IndexedDB snapshot into the current page.
 *
 * Deletes any existing databases first to avoid VersionError when the app
 * has already created databases at a higher schema version. Then recreates
 * databases with the exact version, object stores, indexes, and records
 * from the snapshot.
 *
 * Must be called after page.goto() so the page has an origin for IndexedDB.
 */
export async function restoreIndexedDB(page: Page, snapshot: IndexedDBSnapshot): Promise<void> {
	await page.evaluate(async (data: IndexedDBSnapshot) => {
		// Delete any existing databases that we're about to restore.
		// This prevents VersionError when the app's JS has already created
		// databases at a different version than the snapshot.
		const existingDbs = await indexedDB.databases();
		for (const dbInfo of existingDbs) {
			if (dbInfo.name && dbInfo.name in data) {
				await new Promise<void>((resolve) => {
					const req = indexedDB.deleteDatabase(dbInfo.name!);
					req.onsuccess = () => resolve();
					req.onerror = () => resolve(); // proceed even if delete fails
				});
			}
		}

		for (const [dbName, dbData] of Object.entries(data)) {
			const storeConfigs = dbData.stores;

			// Open the database with the exact version to trigger onupgradeneeded
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const req = indexedDB.open(dbName, dbData.version);
				req.onupgradeneeded = () => {
					const db = req.result;
					for (const [storeName, storeConfig] of Object.entries(storeConfigs)) {
						if (!db.objectStoreNames.contains(storeName)) {
							const opts: IDBObjectStoreParameters = {
								autoIncrement: storeConfig.autoIncrement,
							};
							if (storeConfig.keyPath !== null) {
								opts.keyPath = storeConfig.keyPath;
							}
							const objectStore = db.createObjectStore(storeName, opts);

							// Recreate indexes
							for (const idx of storeConfig.indexes) {
								objectStore.createIndex(idx.name, idx.keyPath, {
									unique: idx.unique,
									multiEntry: idx.multiEntry,
								});
							}
						}
					}
				};
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});

			// Write records into each object store
			for (const [storeName, storeConfig] of Object.entries(storeConfigs)) {
				if (storeConfig.records.length === 0) continue;

				const tx = db.transaction(storeName, 'readwrite');
				const store = tx.objectStore(storeName);
				for (const record of storeConfig.records) {
					store.put(record);
				}
				await new Promise<void>((resolve, reject) => {
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				});
			}

			db.close();
		}
	}, snapshot);
}

/**
 * Restore localStorage from a saved state.
 */
export async function restoreLocalStorage(page: Page, data: Record<string, string>): Promise<void> {
	await page.evaluate((ls: Record<string, string>) => {
		for (const [key, value] of Object.entries(ls)) {
			localStorage.setItem(key, value);
		}
	}, data);
}
