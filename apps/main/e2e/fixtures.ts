import * as fs from 'fs';
import * as path from 'path';

import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import type { StoreVariant, WcposTestOptions } from '../playwright.config';

import { restoreIndexedDB, restoreLocalStorage, type SavedAuthState } from './indexeddb-helpers';

/**
 * NOTE: Playwright requires object destructuring for the first argument in test callbacks.
 * Use `async ({}, testInfo) =>` NOT `async (_, testInfo) =>`.
 * Biome's noEmptyPattern rule doesn't apply here - Playwright enforces this syntax.
 * CodeRabbit incorrectly suggested using `_` which breaks all tests.
 */

const E2E_USERNAME = process.env.E2E_USERNAME || 'demo';
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'demo';

/**
 * Get the store URL from the project config, with env var override.
 */
export function getStoreUrl(testInfo: TestInfo): string {
	if (process.env.E2E_STORE_URL) return process.env.E2E_STORE_URL;
	const opts = testInfo.project.use as WcposTestOptions;
	return opts.storeUrl || 'https://dev-free.wcpos.com';
}

/**
 * Get the store variant from the project config.
 */
export function getStoreVariant(testInfo: TestInfo): StoreVariant {
	const opts = testInfo.project.use as WcposTestOptions;
	return opts.storeVariant || 'free';
}

/**
 * Authenticate the current page with the test store via OAuth.
 *
 * expo-auth-session opens a popup for OAuth and uses postMessage to
 * receive the callback URL. In Playwright, popups are blocked, so we:
 * 1. Intercept window.open to capture the auth URL
 * 2. Open it in a separate page and complete login
 * 3. Capture the callback redirect URL
 * 4. Send a postMessage to the main page to simulate the popup's callback
 */
export async function authenticateWithStore(page: Page, testInfo: TestInfo) {
	const storeUrl = getStoreUrl(testInfo);
	const context = page.context();

	// Intercept window.open: capture the URL, return fake window to prevent
	// expo-auth-session from falling back to a page redirect.
	await page.addInitScript(() => {
		(window as any).__capturedAuthUrl = null;
		const origOpen = window.open;
		window.open = (url?: string | URL, ...args: any[]) => {
			if (url && url.toString().includes('wcpos')) {
				(window as any).__capturedAuthUrl = url.toString();
				return { closed: false, close: () => {}, location: { href: '' } } as any;
			}
			return origOpen.call(window, url, ...args);
		};
	});

	console.log('[auth] Navigating to /');
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Enter Demo Store' })).toBeVisible({
		timeout: 60_000,
	});
	console.log('[auth] Enter Demo Store button visible');

	// Type the store URL and connect
	const urlInput = page.getByRole('textbox', { name: /Enter the URL/i });
	await urlInput.click();
	await urlInput.fill(storeUrl);
	await page.waitForTimeout(1_000);

	const connectButton = page.getByRole('button', { name: 'Connect' });
	await expect(connectButton).toBeEnabled({ timeout: 10_000 });
	await connectButton.click();
	console.log('[auth] Connect button clicked');

	// Wait for the store to be discovered
	await expect(page.getByTestId('logged-in-users-label')).toBeVisible({ timeout: 60_000 });
	console.log('[auth] logged-in-users-label visible');

	// Click the + button to trigger OAuth
	const addUserButton = page.getByTestId('add-user-button');
	await addUserButton.click();
	console.log('[auth] Add user button clicked');

	// Wait for the auth URL to be captured
	let authUrl: string | null = null;
	for (let i = 0; i < 30; i++) {
		authUrl = await page.evaluate(() => (window as any).__capturedAuthUrl);
		if (authUrl) break;
		await page.waitForTimeout(1_000);
	}

	if (!authUrl) {
		throw new Error('Failed to capture OAuth URL from window.open');
	}
	console.log('[auth] Captured OAuth URL');

	// Get the localStorage handle for postMessage verification
	const handle = await page.evaluate(() =>
		window.localStorage.getItem('ExpoWebBrowserRedirectHandle')
	);
	console.log(`[auth] ExpoWebBrowserRedirectHandle: ${handle}`);

	// Open the auth URL in a new page and complete login
	const loginPage = await context.newPage();
	await loginPage.goto(authUrl);
	await loginPage.waitForLoadState('networkidle');

	// Fill in credentials
	const usernameInput = loginPage.locator('#user_login, #wcpos-user-login');
	const passwordInput = loginPage.locator('#user_pass, #wcpos-user-pass');

	if (await usernameInput.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
		await usernameInput.first().fill(E2E_USERNAME);
	}
	if (await passwordInput.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
		await passwordInput.first().fill(E2E_PASSWORD);
	}

	// Submit login form
	const logInButton = loginPage.locator(
		'#wp-submit, #wcpos-submit, button:has-text("Log In"), input[value="Log In"]'
	);
	await expect(logInButton.first()).toBeVisible({ timeout: 15_000 });
	await logInButton.first().click();

	// After login, the page redirects back with auth tokens.
	// Locally this goes to localhost; in CI it redirects to the Expo deployment URL.
	const appOrigin = new URL(page.url()).origin;
	await loginPage.waitForURL(
		(url) =>
			url.hostname === 'localhost' ||
			url.hostname === '127.0.0.1' ||
			url.origin === appOrigin,
		{ timeout: 60_000 }
	);

	const callbackUrl = loginPage.url();
	// Log only the origin to avoid exposing tokens in CI logs
	console.log(`[auth] Callback received from: ${new URL(callbackUrl).origin}`);
	await loginPage.close();

	// The cashier validation API must complete before the user button works —
	// it populates stores in the local DB, which gives storeID to handleLogin.
	// Set up the response listener BEFORE sending postMessage so we don't miss it.
	const cashierApiPromise = page
		.waitForResponse(
			(response) => response.url().includes('/cashier/') && response.ok(),
			{ timeout: 60_000 }
		)
		.catch(() => null);

	// Simulate the postMessage that the popup would normally send
	await page.evaluate(
		({ url, handle }) => {
			window.postMessage({ url, expoSender: handle }, window.location.origin);
		},
		{ url: callbackUrl, handle }
	);
	console.log('[auth] postMessage sent, waiting for cashier validation API...');

	// Wait for the cashier validation API to complete — this is what populates
	// the stores array that the user button needs to call login().
	const cashierResponse = await cashierApiPromise;
	if (cashierResponse) {
		const body = await cashierResponse.json().catch(() => null);
		const storeCount = Array.isArray(body?.stores) ? body.stores.length : 'N/A';
		console.log(
			`[auth] Cashier API completed: ${cashierResponse.status()} — stores: ${storeCount}, keys: ${body ? Object.keys(body).join(',') : 'null'}`
		);
		if (body?.stores) {
			console.log(`[auth] Stores data: ${JSON.stringify(body.stores).substring(0, 200)}`);
		}
	} else {
		console.log('[auth] Cashier API call not detected within timeout, proceeding anyway...');
	}

	// Give RxDB time to save stores from the API response to IndexedDB
	await page.waitForTimeout(5_000);
	console.log(`[auth] Page URL after auth: ${page.url()}`);

	// Read IDs from IndexedDB to write session state directly.
	// The RxDB reactive observable (populateResource) doesn't reliably re-emit
	// after stores are saved, so clicking the user button fails silently.
	// Instead, we write session state to rx-state-v2 (replicating what login()
	// does via appState.set('current', ...)), then reload so the app hydrates.
	const ids = await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		let siteID = '';
		let wpCredentialsID = '';
		let storeID = '';
		for (const dbInfo of dbs) {
			if (!dbInfo.name || !dbInfo.version) continue;
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const req = indexedDB.open(dbInfo.name!, dbInfo.version);
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});
			for (const name of Array.from(db.objectStoreNames)) {
				if (name.startsWith('sites-') && name.endsWith('-documents')) {
					const tx = db.transaction(name, 'readonly');
					const recs = await new Promise<any[]>((resolve, reject) => {
						const req = tx.objectStore(name).getAll();
						req.onsuccess = () => resolve(req.result);
						req.onerror = () => reject(req.error);
					});
					if (recs[0]) siteID = recs[0].d?.uuid || recs[0].i;
				}
				if (name.startsWith('wp_credentials-') && name.endsWith('-documents')) {
					const tx = db.transaction(name, 'readonly');
					const recs = await new Promise<any[]>((resolve, reject) => {
						const req = tx.objectStore(name).getAll();
						req.onsuccess = () => resolve(req.result);
						req.onerror = () => reject(req.error);
					});
					if (recs[0]) wpCredentialsID = recs[0].d?.uuid || recs[0].i;
				}
				if (name.startsWith('stores-') && name.endsWith('-documents')) {
					const tx = db.transaction(name, 'readonly');
					const recs = await new Promise<any[]>((resolve, reject) => {
						const req = tx.objectStore(name).getAll();
						req.onsuccess = () => resolve(req.result);
						req.onerror = () => reject(req.error);
					});
					if (recs[0]) storeID = recs[0].i;
				}
			}
			db.close();
		}
		return { siteID, wpCredentialsID, storeID };
	});
	console.log(`[auth] IDs from IndexedDB: ${JSON.stringify(ids)}`);

	if (!ids.siteID || !ids.wpCredentialsID || !ids.storeID) {
		throw new Error(`Missing IDs for session state: ${JSON.stringify(ids)}`);
	}

	// Write session state to rx-state-v2 in IndexedDB.
	// The rxdb-premium IndexedDB adapter stores records as {i, d, i0, i1, i2}
	// where i0-i2 are pre-computed compound index strings required for queries:
	//   i0 = ['_deleted', 'id']       (1 + 14 = 15 chars)
	//   i1 = ['_meta.lwt', 'id']      (17 + 14 = 31 chars)
	//   i2 = ['_deleted', '_meta.lwt'] (1 + 17 = 18 chars)
	// The _meta.lwt encoding: (floor(lwt) - 1).padStart(15,'0') + decPart.padEnd(2,'0')
	await page.evaluate(
		async ({ siteID, wpCredentialsID, storeID }) => {
			const dbs = await indexedDB.databases();
			for (const dbInfo of dbs) {
				if (!dbInfo.name || !dbInfo.version) continue;
				const db = await new Promise<IDBDatabase>((resolve, reject) => {
					const req = indexedDB.open(dbInfo.name!, dbInfo.version);
					req.onsuccess = () => resolve(req.result);
					req.onerror = () => reject(req.error);
				});
				const rxStateName = Array.from(db.objectStoreNames).find(
					(n) => n.startsWith('rx-state-v2') && n.endsWith('-documents')
				);
				if (rxStateName) {
					const id = '00000000000000';
					const lwt = Date.now() + 0.01;
					const lwtInt = Math.floor(lwt) - 1;
					const lwtIntStr = lwtInt.toString().padStart(15, '0');
					const lwtDecParts = lwt.toString().split('.');
					const lwtDecStr = (lwtDecParts.length > 1 ? lwtDecParts[1] : '0')
						.padEnd(2, '0')
						.substring(0, 2);
					const encodedLwt = lwtIntStr + lwtDecStr;

					const record: any = {
						i: id,
						d: {
							id,
							sId: 'e2etest000',
							ops: [{ k: 'current', v: { siteID, wpCredentialsID, storeID } }],
							_deleted: false,
							_meta: { lwt },
							_rev: '1-e2etest000',
							_attachments: {},
						},
						i0: '0' + id,
						i1: encodedLwt + id,
						i2: '0' + encodedLwt,
					};

					const tx = db.transaction(rxStateName, 'readwrite');
					tx.objectStore(rxStateName).put(record);
					await new Promise<void>((resolve, reject) => {
						tx.oncomplete = () => resolve();
						tx.onerror = () => reject(tx.error);
					});
					db.close();
					return;
				}
				db.close();
			}
		},
		{ siteID: ids.siteID, wpCredentialsID: ids.wpCredentialsID, storeID: ids.storeID }
	);
	console.log('[auth] Wrote session state to rx-state-v2');

	// Reload so the app re-initializes and hydrates from rx-state-v2
	console.log('[auth] Reloading page to hydrate session...');
	await page.reload();

	const searchProducts = page.getByTestId('search-products');
	await expect(searchProducts).toBeVisible({ timeout: 60_000 });

	// Wait for products to sync (use testID to avoid locale-dependent text)
	await expect(page.getByTestId('data-table-count')).toContainText(/[1-9]/, { timeout: 120_000 });
}

/**
 * Sidebar drawer page indices.
 *
 * The drawer renders icon-only buttons in permanent mode (lg screens).
 * These have no text or aria-labels, so we identify them by position.
 * The order matches the Drawer.Screen definitions in _layout.tsx:
 *   0=POS, 1=Products, 2=Orders, 3=Customers, 4=Reports, 5=Logs, 6=Support
 */
const DRAWER_INDEX: Record<string, number> = {
	pos: 0,
	products: 1,
	orders: 2,
	customers: 3,
	reports: 4,
	logs: 5,
	support: 6,
};

/**
 * Navigate to a drawer page by clicking the sidebar icon button.
 *
 * The drawer shows icon-only in permanent mode (lg screens), so we collect
 * all narrow buttons on the left edge and click by index.
 */
export async function navigateToPage(
	page: Page,
	route: 'pos' | 'products' | 'orders' | 'customers' | 'reports' | 'logs' | 'support'
) {
	const idx = DRAWER_INDEX[route];
	const allButtons = page.locator('button');
	const count = await allButtons.count();
	const sidebarButtons: import('@playwright/test').Locator[] = [];

	for (let i = 0; i < count; i++) {
		const btn = allButtons.nth(i);
		const box = await btn.boundingBox();
		if (box && box.x < 60 && box.width < 60) {
			sidebarButtons.push(btn);
		}
	}

	if (idx >= sidebarButtons.length) {
		throw new Error(`Sidebar button index ${idx} out of range (found ${sidebarButtons.length})`);
	}

	await sidebarButtons[idx].click();
	await page.waitForTimeout(2_000);
}

/**
 * Extended test fixture that provides an authenticated POS page.
 *
 * Instead of running the full OAuth flow per test, restores IndexedDB
 * state that was exported during globalSetup. This takes ~5s instead of
 * ~2-5 minutes per test.
 *
 * Falls back to the full OAuth flow if no saved state exists (e.g. when
 * running individual tests locally without globalSetup).
 */
export const authenticatedTest = base.extend<{ posPage: Page }>({
	posPage: async ({ page }, use, testInfo) => {
		const variant = getStoreVariant(testInfo);
		const statePath = path.join(__dirname, '.auth-state', `${variant}.json`);

		let state: SavedAuthState | null = null;
		if (fs.existsSync(statePath)) {
			try {
				state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
			} catch (e) {
				console.warn(`[posPage] Failed to parse saved state, falling back to OAuth:`, e);
			}
		}

		if (state) {
			try {
				// Navigate first to establish origin for IndexedDB access
				await page.goto('/');

				// Restore IndexedDB and localStorage before the app fully initializes
				await restoreIndexedDB(page, state.indexedDB);
				await restoreLocalStorage(page, state.localStorage);

				// Reload so the app picks up the restored state
				await page.reload();

				// App should skip auth and go straight to POS
				// Use testIDs to avoid locale-dependent locators
				const searchProducts = page.getByTestId('search-products');
				await expect(searchProducts).toBeVisible({ timeout: 60_000 });
				await expect(page.getByTestId('data-table-count')).toContainText(/[1-9]/, {
					timeout: 60_000,
				});
			} catch (e) {
				console.warn('[posPage] Saved state invalid/expired; falling back to OAuth.', e);
				await authenticateWithStore(page, testInfo);
			}
		} else {
			// No saved state — fall back to full OAuth (local dev without globalSetup)
			await authenticateWithStore(page, testInfo);
		}

		await use(page);
	},
});
