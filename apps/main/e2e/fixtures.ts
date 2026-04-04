import * as fs from 'fs';
import * as path from 'path';

import { test as base, expect, type Page, type TestInfo } from '@playwright/test';

import { restoreOPFS } from './opfs-helpers';
import { restoreLocalStorage, type SavedAuthState } from './indexeddb-helpers';

import type { StoreVariant, WcposTestOptions } from '../playwright.config';

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
 *
 * After the cashier API validates the credentials and stores are written
 * to OPFS, we click the wp-user-button pill to trigger login() which sets
 * the session state. Unlike the old approach (writing directly to IndexedDB),
 * this works with the OPFS storage backend.
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

	if (
		await usernameInput
			.first()
			.isVisible({ timeout: 5_000 })
			.catch(() => false)
	) {
		await usernameInput.first().fill(E2E_USERNAME);
	}
	if (
		await passwordInput
			.first()
			.isVisible({ timeout: 5_000 })
			.catch(() => false)
	) {
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
			url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.origin === appOrigin,
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
		.waitForResponse((response) => response.url().includes('/cashier/') && response.ok(), {
			timeout: 60_000,
		})
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

	// Give RxDB time to write stores to OPFS after the API response
	await page.waitForTimeout(5_000);
	console.log(`[auth] Page URL after auth: ${page.url()}`);

	// Click the wp-user-button pill to trigger login().
	//
	// The WpUser component uses useObservableSuspense(wpUser.populateResource('stores')).
	// The component only renders (suspense resolves) once the stores observable emits,
	// so the button being visible implies stores are loaded. We retry a few times in
	// case the OPFS worker hasn't flushed yet and the reactive chain hasn't settled.
	console.log('[auth] Waiting for wp-user-button to appear...');
	const userButton = page.getByTestId('wp-user-button').first();
	await expect(userButton).toBeVisible({ timeout: 30_000 });
	await expect(userButton).toBeEnabled({ timeout: 10_000 });

	let loginSuccess = false;
	const searchProducts = page.getByTestId('search-products');
	for (let attempt = 1; attempt <= 5 && !loginSuccess; attempt++) {
		console.log(`[auth] Clicking wp-user-button (attempt ${attempt})...`);
		await userButton.click();

		// Single-store users login immediately from the button press.
		const reachedPosDirectly = await searchProducts.isVisible({ timeout: 2_000 }).catch(() => false);
		if (reachedPosDirectly) {
			loginSuccess = true;
			break;
		}

		// Multi-store users get a picker first; selecting an option triggers login().
		const firstStoreOption = page.locator('[role="listbox"] [role="option"]').first();
		const storePickerOpened = await firstStoreOption.isVisible({ timeout: 2_000 }).catch(() => false);
		if (storePickerOpened) {
			console.log('[auth] Store picker opened, selecting first store option...');
			await firstStoreOption.click();

			const reachedPosAfterStoreSelect = await searchProducts
				.isVisible({ timeout: 10_000 })
				.catch(() => false);
			if (reachedPosAfterStoreSelect) {
				loginSuccess = true;
				break;
			}
		}

		console.log(`[auth] Login attempt ${attempt} did not reach POS, retrying...`);
		await page.waitForTimeout(2_000);
	}

	if (!loginSuccess) {
		throw new Error('Failed to reach POS after clicking wp-user-button 5 times');
	}

	// Wait for products to sync (use testID to avoid locale-dependent text)
	await expect(page.getByTestId('data-table-count')).toContainText(/[1-9]/, { timeout: 120_000 });
}

/**
 * Sidebar drawer page indices.
 *
 * The drawer renders icon-only buttons in permanent mode (lg screens).
 * These have no text or aria-labels, so we identify them by position.
 * The order matches the Drawer.Screen definitions in _layout.tsx:
 *   0=POS, 1=Products, 2=Orders, 3=Coupons, 4=Customers, 5=Reports, 6=Logs, 7=Support
 */
const DRAWER_INDEX: Record<string, number> = {
	pos: 0,
	products: 1,
	orders: 2,
	coupons: 3,
	customers: 4,
	reports: 5,
	logs: 6,
	support: 7,
};

/**
 * Navigate to a drawer page by clicking the sidebar icon button.
 *
 * The drawer shows icon-only in permanent mode (lg screens), so we collect
 * all narrow buttons on the left edge and click by index.
 */
export async function navigateToPage(
	page: Page,
	route: 'pos' | 'products' | 'orders' | 'coupons' | 'customers' | 'reports' | 'logs' | 'support'
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
 * Instead of running the full OAuth flow per test, restores OPFS state
 * (+ localStorage) that was exported during globalSetup. This takes ~5s
 * instead of ~2-5 minutes per test.
 *
 * How it works:
 *   1. Block all JS so the OPFS worker never starts.
 *   2. Navigate to the origin so OPFS is scoped correctly.
 *   3. Restore OPFS files from the on-disk snapshot — no worker is running
 *      so there are no exclusive createSyncAccessHandle locks to contend with.
 *   4. Restore localStorage.
 *   5. Unblock JS and reload — the app starts fresh, the OPFS worker reads
 *      the restored files, and the app hydrates the saved session.
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
				// Block JavaScript so the OPFS worker never starts — createSyncAccessHandle
				// grants exclusive access, so we must restore files before any worker runs.
				await page.route('**/*.js', (route) => route.abort());
				await page.goto('/');

				// Restore OPFS and localStorage while JS is blocked (no worker running)
				await restoreOPFS(page, state.opfs);
				await restoreLocalStorage(page, state.localStorage);

				// Unblock JS and reload so the app picks up the restored OPFS state
				await page.unroute('**/*.js');
				await page.reload();

				// App should skip auth and go straight to POS
				// Use testIDs to avoid locale-dependent locators
				const searchProducts = page.getByTestId('search-products');
				await expect(searchProducts).toBeVisible({ timeout: 60_000 });
				await expect(page.getByTestId('data-table-count')).toContainText(/[1-9]/, {
					timeout: 60_000,
				});
			} catch (e) {
				// Ensure the JS-blocking route is removed so the fallback can load scripts
				await page.unroute('**/*.js');
				console.warn('[posPage] Saved state invalid/expired; falling back to OAuth.', e);
				await authenticateWithStore(page, testInfo);
			}
		} else {
			// No saved state — fall back to full OAuth (local dev without globalSetup)
			await authenticateWithStore(page, testInfo);
		}

		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook
		await use(page);
	},
});
