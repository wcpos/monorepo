import { expect } from '@playwright/test';

import { authenticatedTest, getStoreUrl, hydrateAuthenticatedPage } from './fixtures';

/**
 * The client protocol signal (mono#1599; gate spec wcpos/woocommerce-pos#1752).
 *
 * Every request to the store's wcpos/v2 surface must carry the query twins
 * `wcpos_protocol=2` and `wcpos_client=web/<version>` — the strip-proof channel
 * the 1.11.0 gate keys on. On WEB the matching headers must be ABSENT: the
 * released fleet's CORS allow-list is static and does not include them, so a
 * web client sending them would fail preflight on every request against every
 * released store. (Native/electron header coverage is unit-pinned in
 * engine-fetcher.test.ts — Playwright drives the web bundle only.)
 *
 * The connect-time probes (echo, auth/test) are deliberately excluded: they
 * predate the signal and were left untouched by design.
 */

const test = authenticatedTest.extend({
	posPage: async ({ page }, use, testInfo) => {
		await hydrateAuthenticatedPage(page, testInfo, { waitForCatalogue: false });
		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API
		await use(page);
	},
});

/** wcpos/v2 sync-surface requests, both permalink styles, minus the probe lanes. */
function isSyncSurfaceRequest(url: URL, storeOrigin: string): boolean {
	if (url.origin !== storeOrigin) return false;
	const route = url.searchParams.get('rest_route') ?? url.pathname;
	if (!route.includes('/wcpos/v2/')) return false;
	if (route.includes('/echo') || route.includes('/auth/')) return false;
	return true;
}

test('every sync request carries the query twins and web sends no signal headers', async ({
	posPage: page,
}, testInfo) => {
	const storeOrigin = new URL(getStoreUrl(testInfo)).origin;
	const seen: { url: URL; headers: Record<string, string> }[] = [];
	page.on('request', (request) => {
		let url: URL;
		try {
			url = new URL(request.url());
		} catch {
			return;
		}
		if (!isSyncSurfaceRequest(url, storeOrigin)) return;
		seen.push({ url, headers: request.headers() });
	});

	// The engine's boot traffic (census, change-signal tick) provides the
	// sample; no store contents are assumed (store-agnostic policy).
	await expect
		.poll(() => seen.length, {
			timeout: 60_000,
			message: 'the app issued no wcpos/v2 sync requests to observe',
		})
		.toBeGreaterThanOrEqual(3);

	for (const { url, headers } of seen) {
		expect(url.searchParams.get('wcpos_protocol'), `missing wcpos_protocol on ${url}`).toBe('2');
		expect(
			url.searchParams.get('wcpos_client'),
			`missing/malformed wcpos_client on ${url}`
		).toMatch(/^web\/.+/);
		// The CORS constraint, asserted at the wire: web must NOT send the
		// signal headers while the fleet's allow-list lacks them.
		expect(headers['x-wcpos-protocol'], `web sent X-WCPOS-Protocol on ${url}`).toBeUndefined();
		expect(headers['x-wcpos-client'], `web sent X-WCPOS-Client on ${url}`).toBeUndefined();
	}
});
