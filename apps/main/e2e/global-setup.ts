import { chromium, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

import { authenticateWithStore } from './fixtures';
import type { IndexedDBSnapshot } from './indexeddb-helpers';

import type { StoreVariant, WcposTestOptions } from '../playwright.config';

const AUTH_STATE_DIR = path.join(__dirname, '.auth-state');

const FREE_STORE_URL = 'https://dev-free.wcpos.com';
const PRO_STORE_URL = 'https://dev-pro.wcpos.com';

/**
 * Export all IndexedDB databases from the page.
 *
 * Captures every database, object store (with schema metadata), and record.
 * This is a generic IndexedDB-level clone that works regardless of how RxDB
 * internally structures its data.
 */
async function exportIndexedDB(page: Page): Promise<IndexedDBSnapshot> {
	return page.evaluate(async () => {
		const databases = await indexedDB.databases();
		const snapshot: IndexedDBSnapshot = {};

		for (const dbInfo of databases) {
			if (!dbInfo.name || !dbInfo.version) continue;

			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const req = indexedDB.open(dbInfo.name!, dbInfo.version);
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});

			const dbSnapshot: IndexedDBSnapshot[string] = {
				version: db.version,
				stores: {},
			};

			for (const storeName of Array.from(db.objectStoreNames)) {
				const tx = db.transaction(storeName, 'readonly');
				const store = tx.objectStore(storeName);

				// Capture object store metadata
				const indexes: Array<{
					name: string;
					keyPath: string | string[];
					unique: boolean;
					multiEntry: boolean;
				}> = [];
				for (const indexName of Array.from(store.indexNames)) {
					const idx = store.index(indexName);
					indexes.push({
						name: idx.name,
						keyPath: idx.keyPath as string | string[],
						unique: idx.unique,
						multiEntry: idx.multiEntry,
					});
				}

				const records = await new Promise<any[]>((resolve, reject) => {
					const req = store.getAll();
					req.onsuccess = () => resolve(req.result);
					req.onerror = () => reject(req.error);
				});

				dbSnapshot.stores[storeName] = {
					keyPath: store.keyPath as string | string[] | null,
					autoIncrement: store.autoIncrement,
					indexes,
					records,
				};
			}

			db.close();
			snapshot[dbInfo.name] = dbSnapshot;
		}

		return snapshot;
	});
}

/**
 * Export localStorage from the page.
 */
async function exportLocalStorage(page: Page): Promise<Record<string, string>> {
	return page.evaluate(() => {
		const data: Record<string, string> = {};
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key) {
				data[key] = localStorage.getItem(key) || '';
			}
		}
		return data;
	});
}

/**
 * Run auth for a single store variant, export state, and save to disk.
 */
async function setupVariant(
	variant: StoreVariant,
	storeUrl: string,
	baseURL: string
): Promise<void> {
	console.log(`[global-setup] Authenticating with ${variant} store: ${storeUrl}`);

	const browser = await chromium.launch();
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 1280, height: 720 },
	});
	const page = await context.newPage();

	// Create a mock testInfo that provides the store config
	const testInfo = {
		project: {
			use: {
				storeVariant: variant,
				storeUrl,
			} as WcposTestOptions,
		},
	};

	try {
		await authenticateWithStore(page, testInfo as any);

		console.log(`[global-setup] Auth complete for ${variant}, exporting state...`);

		const indexedDB = await exportIndexedDB(page);
		const localStorage = await exportLocalStorage(page);

		const state = { indexedDB, localStorage };
		const statePath = path.join(AUTH_STATE_DIR, `${variant}.json`);
		fs.writeFileSync(statePath, JSON.stringify(state));

		console.log(
			`[global-setup] Saved ${variant} state (${Object.keys(indexedDB).length} databases)`
		);
	} finally {
		await context.close();
		await browser.close();
	}
}

/**
 * Playwright globalSetup: authenticate once per store variant and save state.
 */
async function globalSetup() {
	const baseURL = process.env.BASE_URL || 'http://localhost:8081';

	// Create the state directory
	fs.mkdirSync(AUTH_STATE_DIR, { recursive: true });

	// Auth both variants in sequence (parallel would contend on the same stores)
	await setupVariant('free', FREE_STORE_URL, baseURL);
	await setupVariant('pro', PRO_STORE_URL, baseURL);

	console.log('[global-setup] All variants authenticated and saved.');
}

export default globalSetup;
