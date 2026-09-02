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
 * The connect-time probes (echo, auth/test) and the boot reachability ping are
 * deliberately excluded: they predate the signal and were left untouched by design.
 */

type SyncRequest = { url: URL; headers: Record<string, string> };

// Restored-session boot reads vary with cached/store state, so this floors the
// captured wcpos/v2 sample at non-empty rather than assuming a census/ping + first-page count.
const MIN_BOOT_SYNC_REQUESTS = 1;

const test = authenticatedTest.extend<{ syncRequests: SyncRequest[] }>({
	syncRequests: async ({}, provide) => {
		await provide([]);
	},
	posPage: async ({ page, syncRequests }, provide, testInfo) => {
		const storeOrigin = new URL(getStoreUrl(testInfo)).origin;
		page.on('request', (request) => {
			let url: URL;
			try {
				url = new URL(request.url());
			} catch {
				return;
			}
			if (!isSyncSurfaceRequest(url, storeOrigin)) return;
			syncRequests.push({ url, headers: request.headers() });
		});
		await hydrateAuthenticatedPage(page, testInfo, { waitForCatalogue: false });
		await provide(page);
	},
});

/** wcpos/v2 sync-surface requests, both permalink styles, minus the probe lanes. */
function isSyncSurfaceRequest(url: URL, storeOrigin: string): boolean {
	if (url.origin !== storeOrigin) return false;
	const route = url.searchParams.get('rest_route') ?? url.pathname;
	if (!route.includes('/wcpos/v2/')) return false;
	if (route.includes('/echo') || route.includes('/auth/')) return false;
	// The boot reachability ping (hydration-steps.ts → wcpos/v2/ping?wcpos=1) is
	// a bare `cors` fetch whose only referent is the status code; it predates the
	// signal like echo/auth. Sampling from before hydration (PR #1767) made it
	// visible for the first time — run 33647740361 on both stores.
	if (route.includes('/ping')) return false;
	return true;
}

test('every sync request uses the protocol transport proven by the store echo', async ({
	posPage: _page,
	request,
	syncRequests,
}, testInfo) => {
	const storeUrl = getStoreUrl(testInfo);
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
	// Boot traffic provides the sample; no idle-cadence request is required.
	await expect
		.poll(() => syncRequests.length, {
			timeout: 10_000,
			message: 'the app issued no wcpos/v2 sync requests to observe',
		})
		.toBeGreaterThanOrEqual(MIN_BOOT_SYNC_REQUESTS);

	for (const { url, headers } of syncRequests) {
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
