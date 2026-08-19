import { expect } from '@playwright/test';

import {
	getStoreUrl,
	getStoreVariant,
	navigateToPage,
	authenticatedTest as test,
} from './fixtures';
import { createSearchProbe, deleteSearchProbe, productWriterAuthorization } from './search-probe';

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
 *    `menu_order`: READ the rendered first row, then name the probe so it lands
 *    first under whatever sort is actually applied.
 * Measured against dev-pro with that method: arrival in ~2 seconds.
 */
test('a product created on the server reaches the products grid without a search', async ({
	posPage: page,
	request,
	storeAuthorization,
}, testInfo) => {
	// The Products page is a Pro-only drawer screen (same gate every
	// products-page spec uses) — on free there is no grid to assert against.
	test.skip(getStoreVariant(testInfo) !== 'pro', 'Products page requires Pro');

	const storeUrl = getStoreUrl(testInfo);
	const writer = await productWriterAuthorization(request, storeUrl);
	const authorization = writer ?? storeAuthorization();

	await navigateToPage(page, 'products');
	const screen = page.getByTestId('screen-products').filter({ visible: true });
	await expect(screen.getByTestId('data-table-count')).toBeVisible({ timeout: 60_000 });
	await screen.getByTestId('data-table-header-name').first().click();
	await page.waitForTimeout(2_000);
	const firstRow = await screen
		.locator('[data-testid^="data-table-row-"]')
		.first()
		.getAttribute('data-testid');

	// Land the probe in the first page of rendered rows under the sort that is
	// actually applied, so arrival needs no scrolling.
	const descending = (firstRow ?? '') > 'data-table-row-m';
	const created = await createSearchProbe({
		request,
		storeUrl,
		authorization,
		collection: 'products',
		workerIndex: testInfo.workerIndex,
		writerConfigured: Boolean(writer),
		productData: { name: `${descending ? 'zzzz' : 'aaaa'} arrival probe ${Date.now()}` },
	});
	if (!created.ok) {
		test.skip(true, created.reason);
		return;
	}

	try {
		if (!created.probe.rowTestId) {
			throw new Error('Arrival probe is missing its slug-derived row testID');
		}
		// The budget is deliberately far above the default poll interval: this
		// asserts the contract holds, not how fast the pipeline happens to be.
		await expect(
			screen.getByTestId(created.probe.rowTestId),
			'a product created on the server must reach the grid without a search or manual sync'
		).toBeVisible({ timeout: 120_000 });
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
