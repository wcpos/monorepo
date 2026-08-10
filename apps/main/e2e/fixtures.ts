import * as fs from 'fs';
import * as path from 'path';

import {
	test as base,
	type BrowserContext,
	expect,
	type Locator,
	type Page,
	type TestInfo,
} from '@playwright/test';

import { log } from '@wcpos/utils/logger';

import { cashierAuthStateName, getE2ECashierAuth } from './cashier-slot';
import { captureCreatedOrderIds, finalizeCreatedOrders } from './order-cleanup';
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
const STUB_WCPOS_VERSION_IN_E2E = process.env.E2E_STUB_WCPOS_VERSION !== 'false';
const APP_PACKAGE_VERSION = JSON.parse(
	fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
).version;
const VERSION_STUBBED_CONTEXTS = new WeakSet<BrowserContext>();
const AUTH_ENTRY_ATTEMPTS = 3;
const AUTH_ENTRY_RETRY_DELAY_MS = 15_000;

/**
 * How the app presents its store credentials: some sites accept the JWT in an
 * `Authorization` header, others (when `use_jwt_as_param` is set) can only take
 * it as a query parameter.
 */
export type StoreAuthorization = { transport: 'header' | 'query'; value: string };

/**
 * Record the header or query-parameter authorization the app sends to the
 * store, so a spec can probe the REST API with the same credentials and
 * transport the app uses (the JWT itself lives inside OPFS, which the test
 * process cannot read).
 *
 * Attach this BEFORE the app boots — `authenticatedTest` does so by declaring
 * `storeAuthorization` as a dependency of `posPage`.
 */
export function captureStoreAuthorization(page: Page): () => StoreAuthorization | null {
	let authorization: StoreAuthorization | null = null;
	page.on('request', (request) => {
		if (!request.url().includes('/wcpos/v2/')) return;
		const header = request.headers()['authorization'];
		const query = new URL(request.url()).searchParams.get('authorization');
		if (header) authorization = { transport: 'header', value: header };
		else if (query) authorization = { transport: 'query', value: query };
	});
	return () => authorization;
}

/**
 * Request options that carry the app's own store credentials, for out-of-band
 * `APIRequestContext` calls (which page route stubs never touch).
 */
export function storeRequestOptions(authorization: StoreAuthorization | null): {
	headers: Record<string, string>;
	params: Record<string, string>;
} {
	return {
		headers: {
			'X-WCPOS': '1',
			...(authorization?.transport === 'header' ? { Authorization: authorization.value } : {}),
		},
		params: authorization?.transport === 'query' ? { authorization: authorization.value } : {},
	};
}

/**
 * Shared-SKU fallback for forks that do not receive product-writer secrets.
 *
 * These specs used to add whichever product happened to render first in the
 * catalogue. When that product is stock-managed, parallel CI shards check out
 * the same inventory and a shard can fail purely because another shard drained
 * the stock. Writer-enabled CI now creates worker-private products; this
 * remains only so secretless forks keep running the former degraded path.
 *
 * `woo-belt` is WooCommerce sample data (simple, published, `manage_stock`
 * false, `stock_status` instock) and is present on the free, pro and next dev
 * stores. Override for stores with a different catalogue.
 */
export const E2E_PRODUCT_SKU = process.env.E2E_PRODUCT_SKU || 'woo-belt';

/**
 * Whether a locator becomes visible within `timeout`.
 *
 * `Locator.isVisible()` samples the DOM once and returns immediately — its
 * `timeout` option does not make it wait — so it reports "missing" for anything
 * that is merely still rendering. Use this wherever the answer decides which
 * branch a helper takes.
 */
export async function becomesVisible(locator: Locator, timeout: number): Promise<boolean> {
	return locator
		.waitFor({ state: 'visible', timeout })
		.then(() => true)
		.catch(() => false);
}

/**
 * Try to add the fallback E2E product to the cart by searching for its SKU.
 *
 * Returns `added` when the product landed in the cart, `unavailable` when the
 * store cannot add the SKU directly, and `add_failed` when a simple product
 * matched but did not reach the cart.
 *
 * The search box is always left cleared so the caller sees an unfiltered POS.
 */
export async function tryAddProductBySku(
	page: Page,
	sku = E2E_PRODUCT_SKU
): Promise<'added' | 'unavailable' | 'add_failed'> {
	// `waitFor`, not `isVisible` — `isVisible()` samples the DOM once and returns
	// immediately, so it would report "missing" on anything still rendering.
	const search = page.getByTestId('search-products');
	if (!(await becomesVisible(search, 30_000))) {
		log.info('[product] search unavailable — falling back to first catalogue product');
		return 'unavailable';
	}

	const resultCount = page.getByTestId('data-table-count');
	const unfilteredCount = await resultCount.textContent().catch(() => null);
	await search.fill(sku);
	// Search is debounced and resolves against the local RxDB replica.
	await page.waitForTimeout(2_000);

	// `product-tile` is the simple-product tile; variable products render as
	// `variable-product-tile` and would open a variation picker instead.
	const tiles = page.getByTestId('product-tile');
	const variableTiles = page.getByTestId('variable-product-tile');
	const rowButtons = page.getByTestId('add-to-cart-button');

	// A SKU matches exactly one product, so wait for the result count to change
	// from the unfiltered query and for every rendered product type to agree.
	// The grid keeps showing its deferred, unfiltered catalogue for a beat after
	// the query changes; counting only simple tiles can mistake that stale view
	// for a match when the remaining tiles are variable products.
	const matched = await expect
		.poll(
			async () => {
				const filteredCount = await resultCount.textContent().catch(() => null);
				if (unfilteredCount === null || filteredCount === unfilteredCount) return 0;
				return (await tiles.count()) + (await variableTiles.count()) + (await rowButtons.count());
			},
			{
				timeout: 15_000,
				intervals: [250, 500, 1_000],
			}
		)
		.toBe(1)
		.then(() => true)
		.catch(() => false);

	if (!matched) {
		log.info(`[product] SKU "${sku}" not in this store — falling back to first catalogue product`);
		await search.clear();
		await page.waitForTimeout(1_000);
		return 'unavailable';
	}

	if (await variableTiles.count()) {
		log.info(`[product] SKU "${sku}" is variable — falling back to first catalogue product`);
		await search.clear();
		await page.waitForTimeout(1_000);
		return 'unavailable';
	}

	if (await tiles.count()) {
		await tiles.first().click();
	} else {
		await rowButtons.first().click();
	}

	const inCart = await becomesVisible(page.getByTestId('checkout-button'), 15_000);

	await search.clear();
	await page.waitForTimeout(1_000);

	if (!inCart) {
		log.info(`[product] SKU "${sku}" matched but never reached the cart`);
		return 'add_failed';
	}

	log.info(`[product] added dedicated SKU "${sku}" to the cart`);
	return 'added';
}

export function isRouteTeardownError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	return (
		error.message.includes('Target page, context or browser has been closed') ||
		error.message.includes('Response has been disposed') ||
		error.message.includes('Test ended')
	);
}

export async function waitForAuthEntry(page: Page): Promise<void> {
	for (let attempt = 1; attempt <= AUTH_ENTRY_ATTEMPTS; attempt++) {
		await page.goto('/', { waitUntil: 'commit' });
		try {
			await page.getByTestId('enter-demo-store-button').waitFor({
				state: 'visible',
				timeout: 60_000,
			});
			return;
		} catch (error) {
			if (attempt === AUTH_ENTRY_ATTEMPTS) {
				throw error;
			}

			console.log(
				`[auth] Deployment shell unavailable (attempt ${attempt}/${AUTH_ENTRY_ATTEMPTS}), retrying...`
			);
			await page.waitForTimeout(AUTH_ENTRY_RETRY_DELAY_MS * attempt);
		}
	}
}

export async function waitForOAuthCallback(page: Page, appOrigin: string): Promise<void> {
	const callback = page.waitForURL(
		(url) =>
			url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.origin === appOrigin,
		{ timeout: 60_000 }
	);
	const logPermissionFailure = page
		.waitForFunction(
			() => {
				const text = document.body?.innerText || '';
				return text.includes('/wp-content/uploads/wc-logs/') && text.includes('Permission denied');
			},
			undefined,
			{ timeout: 60_000 }
		)
		.then(() => {
			throw new Error(
				'WordPress cannot write to wp-content/uploads/wc-logs, so OAuth callback headers cannot be sent. Restore the dev server directory ownership/permissions and rerun E2E.'
			);
		});

	await Promise.race([callback, logPermissionFailure]);
}

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

export async function stubStoreVersionForE2E(
	context: BrowserContext,
	storeUrl: string,
	variant: StoreVariant
): Promise<void> {
	if (!STUB_WCPOS_VERSION_IN_E2E || VERSION_STUBBED_CONTEXTS.has(context)) {
		return;
	}

	VERSION_STUBBED_CONTEXTS.add(context);
	const storeOrigin = new URL(storeUrl).origin;
	await context.route('**/wp-json**', async (route) => {
		try {
			const url = new URL(route.request().url());
			if (
				url.origin !== storeOrigin ||
				url.pathname.replace(/\/+$/, '') !== '/wp-json' ||
				!url.searchParams.has('wcpos')
			) {
				await route.fallback();
				return;
			}

			const response = await route.fetch();
			let data: Record<string, unknown>;
			try {
				data = await response.json();
			} catch {
				// Not JSON (e.g. a transient wp-env error page). Pass the original
				// response through unstubbed so only this test sees the failure.
				console.warn(
					`[stubStoreVersionForE2E] Non-JSON response (status ${response.status()}) for ${route.request().url()}; passing through unstubbed.`
				);
				await route.fulfill({ response });
				return;
			}
			await route.fulfill({
				response,
				json: {
					...data,
					wcpos_version: APP_PACKAGE_VERSION,
					wcpos_pro_version: variant === 'pro' ? APP_PACKAGE_VERSION : '',
					license: variant === 'pro' ? { key: 'e2e-pro-license' } : {},
				},
			});
		} catch (error) {
			if (isRouteTeardownError(error)) {
				return;
			}
			// Throwing from a route handler surfaces as an unhandled rejection and
			// kills the whole worker process (every test in the shard fails). Log
			// and let the request continue unstubbed instead.
			console.warn('[stubStoreVersionForE2E] Route handler failed; continuing unstubbed:', error);
			await route.fallback().catch(() => {});
		}
	});
}

/**
 * Determine whether the app has left the /connect flow and reached POS.
 *
 * We cannot rely on a single selector (`search-products`) because layout/state
 * can vary between environments and hydration timing. Route transition away from
 * /connect is the most stable signal, with UI markers as a fallback.
 */
async function hasReachedPos(page: Page, timeout = 0): Promise<boolean> {
	const onPosRoute = await page
		.waitForURL((url) => !url.pathname.startsWith('/connect'), { timeout })
		.then(() => true)
		.catch(() => false);

	if (onPosRoute) return true;

	const posMarkers = [
		page.getByTestId('search-products').first(),
		page.getByTestId('data-table-count').first(),
	];
	for (const marker of posMarkers) {
		// `becomesVisible`, not `isVisible({ timeout })`: the latter samples once and
		// ignores its timeout, so a marker still rendering would read as "missing".
		const visible = await becomesVisible(marker, 500);
		if (visible) return true;
	}

	return false;
}

export async function blockScriptRequests(route: import('@playwright/test').Route) {
	try {
		if (route.request().resourceType() === 'script') {
			await route.abort();
			return;
		}
		await route.fallback();
	} catch (error) {
		if (!isRouteTeardownError(error)) {
			throw error;
		}
	}
}

/**
 * Wait for RxDB to flush pending writes to OPFS after the cashier API response.
 *
 * The OPFS worker uses createSyncAccessHandle() internally and flushes
 * asynchronously. We cannot poll OPFS files from the main thread while the
 * worker holds exclusive access, so we use a fixed wait instead.
 *
 * Polling OPFS from the main thread would block while the worker holds its
 * exclusive access handle, so persistence is allowed a fixed flush window.
 */
async function waitForOPFSPersistence(page: Page): Promise<void> {
	await page.waitForTimeout(15_000);
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
export async function authenticateWithStore(
	page: Page,
	testInfo: TestInfo,
	options: {
		waitForCatalogue?: boolean;
		credentials?: { username: string; password: string };
		/**
		 * WooCommerce store id to open the POS against. Omit for "whichever store
		 * the picker lists first" — fine for specs that genuinely don't care, wrong
		 * for anything asserting tax behaviour, which depends entirely on WHICH
		 * store's rate set is in play.
		 */
		storeId?: number | string;
	} = {}
) {
	const { waitForCatalogue = true, storeId } = options;
	let discoveredStoreIds: string[] = [];
	const storeUrl = getStoreUrl(testInfo);
	const context = page.context();
	await stubStoreVersionForE2E(context, storeUrl, getStoreVariant(testInfo));

	// Intercept window.open: capture the URL, return fake window to prevent
	// expo-auth-session from falling back to a page redirect.
	await page.addInitScript(() => {
		(window as any).__capturedAuthUrl = null;
		const origOpen = window.open;
		window.open = (url?: string | URL, ...args: any[]) => {
			if (url && url.toString().includes('wcpos')) {
				(window as any).__capturedAuthUrl = url.toString();
				return {
					closed: false,
					close: () => {},
					location: { href: '' },
				} as any;
			}
			return origOpen.call(window, url, ...args);
		};
	});

	console.log('[auth] Navigating to /');
	await waitForAuthEntry(page);
	console.log('[auth] Enter Demo Store button visible');

	// Type the store URL and connect
	const urlInput = page.getByTestId('store-url-input');
	await urlInput.click();
	await urlInput.fill(storeUrl);
	await page.waitForTimeout(1_000);

	const connectButton = page.getByTestId('connect-store-button');
	await expect(connectButton).toBeEnabled({ timeout: 10_000 });
	await connectButton.click();
	console.log('[auth] Connect button clicked');

	// Wait for the store to be discovered
	await expect(page.getByTestId('logged-in-users-label')).toBeVisible({
		timeout: 60_000,
	});
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

	// `becomesVisible` waits for the field to render — `isVisible({ timeout })`
	// ignores its timeout and would skip filling a slow-rendering login form.
	if (await becomesVisible(usernameInput.first(), 5_000)) {
		await usernameInput.first().fill(options.credentials?.username ?? E2E_USERNAME);
	}
	if (await becomesVisible(passwordInput.first(), 5_000)) {
		await passwordInput.first().fill(options.credentials?.password ?? E2E_PASSWORD);
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
	await waitForOAuthCallback(loginPage, appOrigin);

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

	// Give RxDB time to flush pending writes to OPFS after the cashier API response.
	await waitForOPFSPersistence(page);
	console.log(`[auth] Page URL after auth: ${page.url()}`);

	// The redesigned connect screen splits login into two steps:
	//   1. Click wp-user-button (ListItem) — selects the user, which mounts
	//      StoreSelect below with a RadioGroup of stores + an "Open POS" button.
	//      Single-store users have their store auto-selected; multi-store users
	//      pick a RadioGroupItem (handled below by selecting the first option).
	//   2. Click open-pos-button — this is what actually calls login() and
	//      transitions the router out of /connect.
	let loginSuccess = await hasReachedPos(page, 3_000);
	if (loginSuccess) {
		console.log('[auth] POS already visible after auth callback, skipping auth UI.');
	}

	const userButton = page.getByTestId('wp-user-button').first();
	const openPosButton = page.getByTestId('open-pos-button').first();
	for (let attempt = 1; attempt <= 5 && !loginSuccess; attempt++) {
		const reachedPosBeforeClick = await hasReachedPos(page, 1_000);
		if (reachedPosBeforeClick) {
			console.log('[auth] POS became visible before click, continuing...');
			loginSuccess = true;
			break;
		}

		// Step 1: select the wp-user (no-op if already selected/visible).
		const userButtonVisible = await becomesVisible(userButton, 5_000);
		if (!userButtonVisible) {
			console.log(`[auth] wp-user-button not visible (attempt ${attempt}), waiting for POS...`);
			const reachedPosWithoutClick = await hasReachedPos(page, 5_000);
			if (reachedPosWithoutClick) {
				loginSuccess = true;
				break;
			}
			continue;
		}

		console.log(`[auth] Clicking wp-user-button to select user (attempt ${attempt})...`);
		const userClicked = await userButton
			.click({ timeout: 5_000 })
			.then(() => true)
			.catch((error) => {
				console.log(
					`[auth] wp-user-button click failed (attempt ${attempt}): ${error instanceof Error ? error.message : String(error)}`
				);
				return false;
			});
		if (!userClicked) {
			continue;
		}

		// Step 2: wait for the Open POS button to become enabled. It is gated
		// on: stores resolved + store selected + user validation passed.
		// Single-store users have the store auto-selected; for multi-store
		// variants, pick the first radio option to satisfy the store gate.
		const openPosVisible = await becomesVisible(openPosButton, 10_000);
		if (!openPosVisible) {
			console.log(`[auth] open-pos-button not visible (attempt ${attempt}), retrying...`);
			await page.waitForTimeout(2_000);
			continue;
		}

		// Record every store this user is offered, while the picker is still on
		// screen. globalSetup uses this to capture one auth state PER store, which
		// is what lets a spec target the store its assertions actually need
		// instead of accepting whichever one it is handed. Empty for single-store
		// users — the app auto-selects and never renders the picker.
		discoveredStoreIds = await page
			.locator('[data-testid^="store-option-"]')
			.evaluateAll((nodes) =>
				nodes
					.map((node) => node.getAttribute('data-testid')?.replace('store-option-', '') ?? '')
					.filter((id) => id !== '')
			)
			.catch(() => discoveredStoreIds);

		const openPosEnabled = await openPosButton.isEnabled({ timeout: 2_000 }).catch(() => false);
		if (!openPosEnabled) {
			// Multi-store: no auto-selection. Pick the REQUESTED store when the caller
			// named one, otherwise fall back to the first option.
			//
			// A spec that cares which store it runs against (the tax-parity ones do —
			// a single-rate store cannot exercise compound sequencing at all) must be
			// able to ask for one. Before `store-option-<id>` existed the only handle
			// was a localID hash, so "first" was the only reachable choice and tax
			// coverage was whatever the render order happened to give (see
			// woocommerce-pos#1548).
			const storeOption =
				storeId != null
					? page.getByTestId(`store-option-${storeId}`)
					: page
							.locator(
								'[role="radiogroup"] [role="radio"], [role="radiogroup"] input[type="radio"]'
							)
							.first();
			const hasOption = await becomesVisible(storeOption, storeId != null ? 10_000 : 2_000);
			if (hasOption) {
				console.log(
					storeId != null
						? `[auth] Selecting requested store ${storeId}...`
						: '[auth] Selecting first store radio option...'
				);
				await storeOption.click().catch(() => null);
			} else if (storeId != null) {
				// An explicitly requested store that never appears is a broken
				// environment, not something to silently paper over by taking a
				// different store and reporting a pass for it.
				throw new Error(
					`[auth] requested store ${storeId} not offered to this user — available: ${(
						await page
							.locator('[data-testid^="store-option-"]')
							.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid')))
					).join(', ')}`
				);
			} else {
				console.log('[auth] open-pos-button still disabled and no store radio found, waiting...');
				await page.waitForTimeout(2_000);
				continue;
			}
		}

		// Wait for the enabled state to settle, then click Open POS.
		await expect(openPosButton).toBeEnabled({ timeout: 10_000 });
		console.log(`[auth] Clicking open-pos-button (attempt ${attempt})...`);
		const openClicked = await openPosButton
			.click({ timeout: 5_000 })
			.then(() => true)
			.catch((error) => {
				console.log(
					`[auth] open-pos-button click failed (attempt ${attempt}): ${error instanceof Error ? error.message : String(error)}`
				);
				return false;
			});
		if (!openClicked) {
			continue;
		}

		const reachedPos = await hasReachedPos(page, 15_000);
		if (reachedPos) {
			loginSuccess = true;
			break;
		}

		console.log(`[auth] Login attempt ${attempt} did not reach POS, retrying...`);
		await page.waitForTimeout(2_000);
	}

	if (!loginSuccess) {
		throw new Error('Failed to reach POS during auth bootstrap (wp-user-button/open-pos-button)');
	}

	// Wait for products to sync (use testID to avoid locale-dependent text).
	// The cold-start profile (e2e/cold-start.ts) keeps the catalogue empty on
	// purpose, so it opts out of this wait rather than burning its timeout.
	if (waitForCatalogue) {
		await expect(page.getByTestId('data-table-count')).toContainText(/[1-9]/, {
			timeout: 120_000,
		});
	} else {
		await expect(page.getByTestId('search-products')).toBeVisible({ timeout: 120_000 });
	}
	await waitForOPFSPersistence(page);

	return { storeIds: discoveredStoreIds };
}

/**
 * Navigate to a drawer page by its stable, language-agnostic test ID.
 */
export async function navigateToPage(
	page: Page,
	route:
		| 'pos'
		| 'products'
		| 'orders'
		| 'coupons'
		| 'customers'
		| 'reports'
		| 'health'
		| 'settings'
		| 'support'
) {
	const drawerItem = page.getByTestId(`drawer-item-${route}`);
	await expect(drawerItem).toBeVisible({ timeout: 10_000 });
	await drawerItem.click();
	await page.waitForTimeout(2_000);
}

export interface HydrateAuthenticatedPageOptions {
	/** Saved-state basename under e2e/.auth-state (default: the store variant). */
	stateName?: string;
	/**
	 * Wait for a product marker once the app boots. The cold-start profile
	 * turns this off — its catalogue is empty by design.
	 */
	waitForCatalogue?: boolean;
	/**
	 * Runs before the page loads anything — the hook the cold-start profile
	 * uses to install its bulk-sync route stubs.
	 */
	beforeBoot?: (page: Page) => Promise<void>;
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
export async function hydrateAuthenticatedPage(
	page: Page,
	testInfo: TestInfo,
	options: HydrateAuthenticatedPageOptions = {}
): Promise<void> {
	const { waitForCatalogue = true, beforeBoot } = options;
	const variant = getStoreVariant(testInfo);
	const cashierAuth = getE2ECashierAuth(variant, (testInfo.config.shard?.current ?? 1) - 1);
	await stubStoreVersionForE2E(page.context(), getStoreUrl(testInfo), variant);
	if (beforeBoot) await beforeBoot(page);
	const stateName = cashierAuthStateName(options.stateName ?? variant, cashierAuth);
	const statePath = path.join(__dirname, '.auth-state', `${stateName}.json`);

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
			await page.route('**/*', blockScriptRequests);
			await page.goto('/', { waitUntil: 'commit' });

			// Restore OPFS and localStorage while JS is blocked (no worker running)
			await restoreOPFS(page, state.opfs);
			await restoreLocalStorage(page, state.localStorage);

			// Unblock JS and reload so the app picks up the restored OPFS state
			await page.unroute('**/*', blockScriptRequests);
			await page.reload({ waitUntil: 'commit' });

			// App should skip auth and go straight to POS. The product catalog can be
			// empty or still syncing, so the search UI is the readiness marker. If a
			// product marker appears quickly, wait for it to settle without making an
			// empty catalog fail authentication bootstrap. Give product-backed tests a
			// chance to start after the initial sync, but do not make auth depend on it.
			await expect(page.getByTestId('search-products')).toBeVisible({
				timeout: 60_000,
			});
			const appError = page.getByTestId('error-boundary-fallback').first();
			// Intentional one-shot: `search-products` is already visible above, so if the
			// restored state faulted the error boundary has already rendered. A waiting
			// check would add its full timeout to every happy-path hydration for a
			// belt-and-suspenders guard, so we sample once. (`isVisible`'s `timeout` is a
			// no-op regardless.)
			if (await appError.isVisible().catch(() => false)) {
				throw new Error('Saved auth state restored into an app error; falling back to OAuth.');
			}
			if (waitForCatalogue) {
				const productMarker = page
					.getByTestId('product-tile')
					.first()
					.or(page.getByTestId('add-to-cart-button').first())
					.first();
				await productMarker.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
			}
		} catch (e) {
			// Ensure the JS-blocking route is removed so the fallback can load scripts
			await page.unroute('**/*', blockScriptRequests).catch(() => {});
			console.warn('[posPage] Saved state invalid/expired; falling back to OAuth.', e);

			// The OPFS worker is running and holds exclusive createSyncAccessHandle()
			// locks. Block JS and reload to terminate it before clearing state.
			await page.route('**/*', blockScriptRequests);
			await page.reload({ waitUntil: 'commit' });

			// Clear all persisted state so authenticateWithStore sees first-launch
			await page
				.evaluate(async () => {
					// Clear localStorage first — it's synchronous and must happen even
					// if OPFS cleanup throws (stale auth keys block the fallback).
					localStorage.clear();
					const root = await navigator.storage.getDirectory();
					const errors: string[] = [];
					// @ts-expect-error — FileSystemDirectoryHandle.entries() async iterable not typed in lib.dom
					for await (const [name] of root.entries()) {
						try {
							await root.removeEntry(name, { recursive: true });
						} catch (err) {
							errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
						}
					}
					if (errors.length) {
						throw new Error(`Failed to remove OPFS entries: ${errors.join('; ')}`);
					}
				})
				.catch((err) => {
					console.warn('[posPage] Failed to clear OPFS/localStorage:', err);
				});

			// Unblock JS before re-authenticating
			await page.unroute('**/*', blockScriptRequests).catch(() => {});
			await authenticateWithStore(page, testInfo, {
				waitForCatalogue,
				credentials: cashierAuth ?? undefined,
			});
		}
	} else {
		// No saved state — fall back to full OAuth (local dev without globalSetup)
		await authenticateWithStore(page, testInfo, {
			waitForCatalogue,
			credentials: cashierAuth ?? undefined,
		});
	}
}

/**
 * The stores globalSetup found for this variant, in picker order.
 *
 * Empty when globalSetup has not run (a single spec run locally) or the user has
 * one store — callers must treat "no list" as "cannot parameterize", not as an
 * assertion about the environment.
 */
export function listStoreIds(variant: StoreVariant = 'pro'): string[] {
	const listPath = path.join(__dirname, '.auth-state', `stores-${variant}.json`);
	if (!fs.existsSync(listPath)) return [];
	try {
		const parsed = JSON.parse(fs.readFileSync(listPath, 'utf-8')) as { storeIds?: string[] };
		return Array.isArray(parsed.storeIds) ? parsed.storeIds : [];
	} catch {
		return [];
	}
}

export const authenticatedTest = base.extend<{
	posPage: Page;
	storeAuthorization: () => StoreAuthorization | null;
	/**
	 * WooCommerce store id to open the POS against, via `test.use({ targetStoreId })`.
	 *
	 * Null means "whichever store globalSetup's default bootstrap opened". Set it
	 * in any spec whose assertions depend on WHICH store is in play — tax parity
	 * above all, since a single-rate store cannot exercise compound sequencing and
	 * will pass the same assertions without testing them (woocommerce-pos#1548).
	 * Requires globalSetup to have captured that store's state; see `listStoreIds`.
	 */
	targetStoreId: string | null;
}>({
	targetStoreId: [null, { option: true }],
	storeAuthorization: async ({ page }, use) => {
		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook
		await use(captureStoreAuthorization(page));
	},
	posPage: async ({ page, storeAuthorization, request, targetStoreId }, use, testInfo) => {
		// `storeAuthorization` is a declared dependency so its request listener is
		// attached before the app boots and sends its first authenticated request.
		storeAuthorization();
		// Record the server id of every order this spec pushes, so teardown can
		// finalize the ones left as lingering pos-open carts.
		const orderCapture = captureCreatedOrderIds(page);
		await hydrateAuthenticatedPage(page, testInfo, {
			stateName: targetStoreId ? `${getStoreVariant(testInfo)}-store-${targetStoreId}` : undefined,
		});

		// Layout-drift pin (#1106): every POS interaction scopes under screen-pos,
		// and its absence fails as opaque 30s tile timeouts spec-by-spec. Assert it
		// once, here, so a layout/testID rename fails instantly with a clear cause.
		// Both POS layouts must carry it: (tabs)/_layout.tsx AND (pos)/(columns)/index.tsx.
		await expect(
			page.getByTestId('screen-pos').filter({ visible: true }).first(),
			'testID="screen-pos" is missing from the rendered POS layout — see #1106'
		).toBeVisible({ timeout: 30_000 });

		try {
			// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook
			await use(page);
		} finally {
			// Best-effort: transition any still-open carts this spec created to a
			// terminal status (cancelled) so they don't pile up on the shared dev
			// store. Reuses the app's own captured credentials/transport. This must
			// never fail the test — finalizeCreatedOrders swallows all errors, but
			// we guard the settle()+call as well (route-handler-never-rethrow, #997).
			try {
				await orderCapture.settle();
				await finalizeCreatedOrders(
					request,
					getStoreUrl(testInfo),
					orderCapture.createdOrderIds,
					storeRequestOptions(storeAuthorization())
				);
			} catch (error) {
				log.warn(
					`[order-cleanup] teardown failed: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	},
});
