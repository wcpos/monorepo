import { expect } from '@playwright/test';

import { LOADED_COUNT_READY, LOADED_COUNT_TEST_ID } from './catalogue-readiness';
import { getStoreVariant, navigateToPage, authenticatedTest as test } from './fixtures';

/**
 * Coupons page (pro-only drawer page).
 *
 * Screen locators are scoped `.filter({ visible: true })`: navigation keeps
 * the previous screen instance MOUNTED, so a bare `screen-coupons` locator can
 * resolve into the stale hidden copy — whose table body renders the empty-state
 * row while its footer still shows the old count. That mismatch is exactly what
 * the mono#1127 shard-3 failure snapshot captured (doubled page title, "No se
 * encontraron cupones" beside "Mostrando 20 de 48"), and it is why the search
 * test failed through both retries while 48 coupons existed on the store.
 * pos-variations and the pro#425 live spec already scope this way.
 */
function visibleCouponsScreen(page: import('@playwright/test').Page) {
	return page.getByTestId('screen-coupons').filter({ visible: true });
}

test.describe('Coupons Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Coupons page requires Pro');
	});

	test('should navigate to Coupons page and see coupon list', async ({ posPage: page }) => {
		await navigateToPage(page, 'coupons');
		const screen = visibleCouponsScreen(page);
		await expect(screen.getByTestId('search-coupons')).toBeVisible({ timeout: 30_000 });
	});

	test('should show coupon data or empty state', async ({ posPage: page }) => {
		await navigateToPage(page, 'coupons');
		const screen = visibleCouponsScreen(page);
		await expect(screen.getByTestId('search-coupons')).toBeVisible({ timeout: 30_000 });

		await expect
			.poll(
				async () => {
					const hasCoupons = await screen
						.getByTestId('data-table-count')
						.isVisible()
						.catch(() => false);
					const noCoupons = await screen
						.getByTestId('no-data-message')
						.isVisible()
						.catch(() => false);
					return hasCoupons || noCoupons;
				},
				{ timeout: 30_000 }
			)
			.toBeTruthy();
	});

	test('should search coupons', async ({ posPage: page }) => {
		await navigateToPage(page, 'coupons');
		const screen = visibleCouponsScreen(page);
		await expect(screen.getByTestId('search-coupons')).toBeVisible({ timeout: 30_000 });

		// Gate on the LOCAL result materializing, not on the count element merely
		// existing: the footer renders immediately and reports "0 de 0" until the
		// coupons sync lands, which can outlast 30s under full-shard CI load (the
		// other half of the mono#1127 shard-3 failure). `data-table-loaded-count`
		// carries the rendered-row count on its own — never parse the translated
		// footer sentence, whose number order is locale-dependent and whose server
		// total also matches digit regexes (#1336, #1345).
		const loadedCount = screen.getByTestId(LOADED_COUNT_TEST_ID);
		const loadedRows = async (): Promise<number> =>
			Number((await loadedCount.textContent().catch(() => '')) ?? '') || 0;
		await expect(loadedCount).toHaveText(LOADED_COUNT_READY, { timeout: 90_000 });
		const shownBefore = await loadedRows();

		const firstRow = screen.getByTestId(/^data-table-row-/).first();
		await expect(firstRow).toBeVisible({ timeout: 15_000 });

		// Derive the search term from a coupon that demonstrably exists — the
		// leading token of the first row is its code cell. Searching a hardcoded
		// 'test' assumed the store's contents, which the store-agnostic policy
		// forbids (and which breaks the day someone tidies the dev store).
		const firstRowText = (await firstRow.textContent()) ?? '';
		const token = firstRowText.match(/[a-z][a-z0-9]{2,}/i)?.[0];
		expect(token, `no searchable code token in first coupon row: "${firstRowText}"`).toBeTruthy();
		const nonMatchingRow = screen
			.getByTestId(/^data-table-row-/)
			.filter({ hasNotText: token as string })
			.first();
		test.skip(
			!(await nonMatchingRow.isVisible().catch(() => false)),
			'live store has no coupon row distinguishable by the derived search token'
		);
		const nonMatchingRowTestId = await nonMatchingRow.getAttribute('data-testid');
		expect(nonMatchingRowTestId, 'distinguishable coupon row has no test ID').toBeTruthy();

		const searchInput = screen.getByTestId('search-coupons');
		await searchInput.fill(token as string);

		const matchingRow = screen.getByTestId(/^data-table-row-/).first();
		await expect(matchingRow).toBeVisible({ timeout: 15_000 });
		await expect(matchingRow).toContainText(token as string, { ignoreCase: true });
		await expect(screen.getByTestId(nonMatchingRowTestId as string)).not.toBeVisible({
			timeout: 15_000,
		});
		await expect.poll(loadedRows, { timeout: 15_000 }).toBeLessThan(shownBefore);
	});

	test('should have add coupon button on Coupons page', async ({ posPage: page }) => {
		await navigateToPage(page, 'coupons');
		const screen = visibleCouponsScreen(page);
		await expect(screen.getByTestId('search-coupons')).toBeVisible({ timeout: 30_000 });

		await expect(screen.getByTestId('coupons-add-button')).toBeVisible();
	});
});

/**
 * Free users should see the blurred preview overlay when navigating to Coupons.
 */
test.describe('Coupons Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show upgrade overlay on Coupons', async ({ posPage: page }) => {
		await navigateToPage(page, 'coupons');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button on upgrade overlay', async ({ posPage: page }) => {
		await navigateToPage(page, 'coupons');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('view-demo-button')).toBeVisible();
	});
});
