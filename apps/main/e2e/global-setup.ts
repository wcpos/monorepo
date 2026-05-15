import * as fs from 'fs';
import * as path from 'path';

import { chromium } from '@playwright/test';

import { authenticateWithStore, stubStoreVersionForE2E } from './fixtures';
import { exportOPFS } from './opfs-helpers';

import type { StoreVariant, WcposTestOptions } from '../playwright.config';

const AUTH_STATE_DIR = path.join(__dirname, '.auth-state');

const FREE_STORE_URL =
	process.env.E2E_STORE_URL_FREE || process.env.E2E_STORE_URL || 'https://dev-free.wcpos.com';
const PRO_STORE_URL =
	process.env.E2E_STORE_URL_PRO || process.env.E2E_STORE_URL || 'https://dev-pro.wcpos.com';
const STUB_UPLOADS_IN_CROSS_ORIGIN_E2E = process.env.E2E_STUB_UPLOADS !== 'false';
const TRANSPARENT_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sM7nDUAAAAASUVORK5CYII=';

async function blockScriptRequests(route: import('@playwright/test').Route) {
	if (route.request().resourceType() === 'script') {
		await route.abort();
		return;
	}
	await route.fallback();
}

function shouldStubCrossOriginUploads(storeUrl: string, baseURL: string): boolean {
	try {
		const storeOrigin = new URL(storeUrl).origin;
		const appOrigin = new URL(baseURL).origin;
		return STUB_UPLOADS_IN_CROSS_ORIGIN_E2E && storeOrigin !== appOrigin;
	} catch {
		return false;
	}
}

/**
 * Export localStorage from the page.
 */
async function exportLocalStorage(
	page: import('@playwright/test').Page
): Promise<Record<string, string>> {
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
 *
 * After authenticateWithStore completes (POS visible, products loaded), we
 * need to export the OPFS files that RxDB has written. The OPFS storage uses
 * createSyncAccessHandle() for exclusive file access, so we cannot read the
 * files while the app's OPFS worker is running.
 *
 * Strategy:
 *   1. Close the auth page — this terminates the OPFS worker, releasing all
 *      exclusive file handles.
 *   2. Open a new page in the SAME browser context with JS blocked — the OPFS
 *      partition is tied to the browser context + origin, so OPFS files from
 *      step 1 are still accessible, but no new worker will start.
 *   3. Navigate to the origin to establish the correct OPFS scope.
 *   4. Read OPFS files from the main thread (no worker = no exclusive handles).
 *   5. Read localStorage (shared across pages in the same context + origin).
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

	// In CI preview deployments, app origin differs from dev-* store origins.
	// Product-image attachment fetches then fail CORS and spam errors. For auth
	// bootstrap, those uploads are non-critical, so fulfill them with a tiny
	// image payload to keep bootstrap deterministic across environments.
	if (shouldStubCrossOriginUploads(storeUrl, baseURL)) {
		console.log(
			`[global-setup] Installing uploads stub for cross-origin auth bootstrap (${new URL(storeUrl).origin} -> ${new URL(baseURL).origin})`
		);
		await context.route('**/wp-content/uploads/**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'image/png',
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Cache-Control': 'public, max-age=60',
				},
				body: Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'),
			});
		});
	}
	await stubStoreVersionForE2E(context, storeUrl);
	const authPage = await context.newPage();

	// Capture console output for debugging
	authPage.on('console', (msg) => {
		if (msg.type() === 'error' || msg.type() === 'warning') {
			console.log(`[global-setup] [${variant}] ${msg.type()}: ${msg.text()}`);
		}
	});
	authPage.on('pageerror', (err) => {
		console.log(`[global-setup] [${variant}] PAGE ERROR: ${err.message}`);
	});

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
		await authenticateWithStore(authPage, testInfo as any);

		console.log(`[global-setup] Auth complete for ${variant}, exporting state...`);

		// Close the auth page so the OPFS worker terminates and releases all
		// exclusive file handles (createSyncAccessHandle). We keep the browser
		// context open so the OPFS partition (tied to context+origin) persists.
		await authPage.close();

		// Open a new page with JS blocked so no OPFS worker starts, then
		// navigate to the origin to scope OPFS access correctly.
		const exportPage = await context.newPage();
		await exportPage.route('**/*', blockScriptRequests);
		await exportPage.goto(baseURL);

		// Export OPFS files and localStorage from the main thread.
		// No worker is running, so exclusive handles have been released.
		const opfs = await exportOPFS(exportPage);
		const localStorage = await exportLocalStorage(exportPage);

		const state = { opfs, localStorage };
		const statePath = path.join(AUTH_STATE_DIR, `${variant}.json`);
		fs.writeFileSync(statePath, JSON.stringify(state));

		console.log(`[global-setup] Saved ${variant} state (${Object.keys(opfs).length} OPFS files)`);
	} catch (error) {
		// Capture screenshot for debugging — use the auth page if still open
		const screenshotPage = context.pages().at(-1);
		if (screenshotPage) {
			const screenshotPath = path.join(AUTH_STATE_DIR, `${variant}-failure.png`);
			await screenshotPage.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
			console.log(`[global-setup] Screenshot saved to ${screenshotPath}`);
			console.log(`[global-setup] Page URL at failure: ${screenshotPage.url()}`);
			console.log(
				`[global-setup] Page title: ${await screenshotPage.title().catch(() => 'unknown')}`
			);
			const bodyText = await screenshotPage
				.evaluate(() => document.body?.innerText?.substring(0, 500) || '')
				.catch(() => '');
			console.log(`[global-setup] Visible text: ${bodyText}`);
		}
		throw error;
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
