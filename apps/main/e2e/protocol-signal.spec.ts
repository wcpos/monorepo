import { expect } from '@playwright/test';

import { protocolHeadersSupported } from '@wcpos/utils/sync-protocol';

import { authenticatedTest, getStoreUrl, hydrateAuthenticatedPage } from './fixtures';

/**
 * The client protocol signal (mono#1599; gate spec wcpos/woocommerce-pos#1752).
 *
 * Every web request to the store's wcpos/v2 surface uses the transport proven
 * by that store's echo capability. A floor containing both signal names, or an
 * explicit reflected-header CORS capability, selects headers only; absent or
 * partial evidence conservatively selects the query twins only. Native and
 * Electron coverage remains unit-pinned in engine-fetcher.test.ts.
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

test('every sync request uses the protocol transport proven by the store echo', async ({
	posPage: page,
	request,
}, testInfo) => {
	const storeUrl = getStoreUrl(testInfo);
	const storeOrigin = new URL(storeUrl).origin;
	// The same predicate the app gates on. Mirror the app's transport ladder:
	// a plain-permalink store can only prove capability through the
	// `?rest_route=` echo form, so try it when the path form proves nothing.
	const fetchEcho = async (echoUrl: string) =>
		(await (await request.get(echoUrl)).json().catch(() => null)) as Parameters<
			typeof protocolHeadersSupported
		>[0];
	let supportsProtocolHeaders = protocolHeadersSupported(
		await fetchEcho(new URL('/wp-json/wcpos/v2/echo', storeUrl).toString())
	);
	if (!supportsProtocolHeaders) {
		supportsProtocolHeaders = protocolHeadersSupported(
			await fetchEcho(new URL('/?rest_route=/wcpos/v2/echo', storeUrl).toString())
		);
	}
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
		if (supportsProtocolHeaders) {
			expect(headers['x-wcpos-protocol'], `missing X-WCPOS-Protocol on ${url}`).toBe('2');
			expect(headers['x-wcpos-client'], `missing/malformed X-WCPOS-Client on ${url}`).toMatch(
				/^web\/.+/
			);
			expect(url.searchParams.has('wcpos_protocol'), `sent wcpos_protocol on ${url}`).toBe(false);
			expect(url.searchParams.has('wcpos_client'), `sent wcpos_client on ${url}`).toBe(false);
		} else {
			expect(url.searchParams.get('wcpos_protocol'), `missing wcpos_protocol on ${url}`).toBe('2');
			expect(
				url.searchParams.get('wcpos_client'),
				`missing/malformed wcpos_client on ${url}`
			).toMatch(/^web\/.+/);
			expect(headers['x-wcpos-protocol'], `web sent X-WCPOS-Protocol on ${url}`).toBeUndefined();
			expect(headers['x-wcpos-client'], `web sent X-WCPOS-Client on ${url}`).toBeUndefined();
		}
	}
});
