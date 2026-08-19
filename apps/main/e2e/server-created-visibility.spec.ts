import { expect } from '@playwright/test';

import {
	getStoreUrl,
	getStoreVariant,
	navigateToPage,
	authenticatedTest as test,
} from './fixtures';
import {
	createSearchProbe,
	deleteSearchProbe,
	mintSearchProbeToken,
	productWriterAuthorization,
} from './search-probe';

const ARRIVAL_TIMEOUT_MS = 6 * 60_000 + 30_000;

/**
 * Directional coverage: a record created on the SERVER while the till is open
 * must reach the cashier without a search and without a manual sync.
 *
 * The freshness contract is the merchant's own setting — `sync_check_interval_ms`
 * on the store document, wired to the engine's `changeSignalPollMs` by
 * `apps/main/components/sync-config-bridge.tsx`. Whatever interval a merchant
 * configures is the maximum staleness they have agreed to; a product added in
 * wp-admin must show up within it.
 *
 * Every other product spec creates its probe and then SEARCHES for it, and
 * search always issues server demand — so no other spec can tell the
 * difference between "the change-signal pipeline delivered it" and "the search
 * fetched it just now". This one never types a search term.
 *
 * MEASUREMENT NOTES (learned the hard way, 2026-08-19 — three false readings
 * before this method was sound):
 *  - Do NOT assert on the footer total: it is a cached census/server total and
 *    sits still while records genuinely arrive.
 *  - Do NOT assume a sort direction, and do not try to steer it with
 *    `menu_order`: read the direction from the actual name-browse request, then
 *    name the probe so it lands first under whatever sort is actually applied.
 * Measured against dev-pro with that method: arrival in ~2 seconds.
 */
test('a product created on the server reaches the products grid without a search', async ({
	posPage: page,
	request,
	storeAuthorization,
}, testInfo) => {
	test.setTimeout(8 * 60_000);

	// The Products page is a Pro-only drawer screen (same gate every
	// products-page spec uses) — on free there is no grid to assert against.
	test.skip(getStoreVariant(testInfo) !== 'pro', 'Products page requires Pro');

	const storeUrl = getStoreUrl(testInfo);
	const writer = await productWriterAuthorization(request, storeUrl);
	const authorization = writer ?? storeAuthorization();

	await navigateToPage(page, 'products');
	const screen = page.getByTestId('screen-products').filter({ visible: true });
	await expect(screen.getByTestId('data-table-count')).toBeVisible({
		timeout: 60_000,
	});
	const sortedProductsPending = page.waitForResponse(
		(response) => {
			if (response.request().method() !== 'GET') return false;
			const url = new URL(response.url());
			const route = url.searchParams.get('rest_route');
			const isProductsBrowse =
				url.pathname.endsWith('/wp-json/wcpos/v2/products') || route === '/wcpos/v2/products';
			return isProductsBrowse && url.searchParams.get('orderby') === 'name';
		},
		{ timeout: 60_000 }
	);
	sortedProductsPending.catch(() => {});
	await screen.getByTestId('data-table-header-name').first().click();
	const sortedProducts = await sortedProductsPending;
	if (!sortedProducts.ok()) {
		throw new Error(`Products name browse failed: HTTP ${sortedProducts.status()}`);
	}
	const sortedUrl = new URL(sortedProducts.url());
	const order = sortedUrl.searchParams.get('order');
	if (order !== 'asc' && order !== 'desc') {
		throw new Error('Products name browse did not declare an asc/desc order');
	}
	const sortedBody: unknown = await sortedProducts.json().catch(() => null);
	if (!Array.isArray(sortedBody)) {
		throw new Error('Products name browse returned a malformed product list');
	}
	if (sortedBody.length === 0) {
		test.skip(true, 'Products name browse returned an empty catalog');
		return;
	}
	const anchor = sortedBody[0];
	const anchorSlug =
		anchor && typeof anchor === 'object' && 'slug' in anchor && typeof anchor.slug === 'string'
			? anchor.slug
			: '';
	if (!anchorSlug) {
		throw new Error('Products name browse first record is missing its slug');
	}
	await expect(screen.getByTestId(`data-table-row-${anchorSlug}`).first()).toBeVisible({
		timeout: 30_000,
	});

	// Land the probe in the first page of rendered rows under the sort that is
	// actually applied, so arrival needs no scrolling.
	const token = mintSearchProbeToken(testInfo.workerIndex);
	const created = await createSearchProbe({
		request,
		storeUrl,
		authorization,
		collection: 'products',
		workerIndex: testInfo.workerIndex,
		token,
		writerConfigured: Boolean(writer),
		productData: {
			name: `${order === 'desc' ? 'zzzz' : 'aaaa'} E2E Arrival ${token}`,
		},
	});
	if (!created.ok) {
		test.skip(true, created.reason);
		return;
	}

	try {
		if (!created.probe.rowTestId) {
			throw new Error('Arrival probe is missing its slug-derived row testID');
		}
		// Eco cadence is 300 seconds with up to 20% jitter. Keep 30 seconds for
		// materialization after the latest supported poll fires.
		await expect(
			screen.getByTestId(created.probe.rowTestId),
			'a product created on the server must reach the grid without a search or manual sync'
		).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
	} finally {
		await deleteSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'products',
			id: created.probe.id,
		});
	}
});
