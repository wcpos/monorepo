import { expect, type Page } from '@playwright/test';

import { getStoreVariant, navigateToPage, authenticatedTest as test } from './fixtures';

/** Helper to navigate to Orders page and wait for load */
async function navigateToOrders(page: Page) {
	await navigateToPage(page, 'orders');
	const screen = page.getByTestId('screen-orders');
	await expect(screen.getByTestId('search-orders')).toBeVisible({ timeout: 30_000 });
	return screen;
}

/**
 * Orders page (pro-only).
 */
test.describe('Orders Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Orders page requires Pro');
	});

	test('should navigate to Orders page and see order list', async ({ posPage: page }) => {
		await navigateToOrders(page);
	});

	test('should show order columns', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		// Wait for orders data to load first
		await expect(
			screen.getByTestId('data-table-count').or(screen.getByTestId('no-data-message')).first()
		).toBeVisible({ timeout: 30_000 });

		// Check that column headers are present (at least 2 expected)
		const columnHeaders = screen.getByRole('columnheader');
		await expect(columnHeaders.first()).toBeVisible({ timeout: 15_000 });
		expect(await columnHeaders.count()).toBeGreaterThanOrEqual(2);
	});

	test('should show orders or empty state', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		// Poll so the assertion waits for whichever state resolves. A bare
		// `isVisible({ timeout })` samples once and ignores its timeout, so both
		// reads could be false while the table is still loading (#1044).
		await expect
			.poll(
				async () => {
					const hasOrders = await screen
						.getByTestId('data-table-count')
						.isVisible()
						.catch(() => false);
					const noOrders = await screen
						.getByTestId('no-data-message')
						.isVisible()
						.catch(() => false);
					return hasOrders || noOrders;
				},
				{ timeout: 30_000 }
			)
			.toBeTruthy();
	});

	test('should search orders', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);
		const countEl = screen.getByTestId('data-table-count');
		await expect(countEl).toBeVisible({ timeout: 30_000 });
		const initialCount = await countEl.textContent();
		await expect(screen.getByTestId(/^data-table-row-/).first()).toBeVisible({ timeout: 30_000 });

		const searchInput = screen.getByTestId('search-orders');
		// Order 70954 is a retained dev-next E2E fixture documented in the sync regression suite.
		await searchInput.fill('70954');

		const matchingRows = screen.getByTestId(/^data-table-row-/);
		await expect(matchingRows).toHaveCount(1, { timeout: 30_000 });
		await expect(matchingRows.first()).toBeVisible();
		await expect(matchingRows.first()).toContainText('70954');
		await expect.poll(() => countEl.textContent(), { timeout: 30_000 }).not.toBe(initialCount);
	});

	test('should show filter pills', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		await expect(screen.getByTestId('order-filter-status')).toBeVisible({ timeout: 15_000 });
	});

	test('should show order actions menu', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		const actionsButton = screen.getByTestId('order-actions-button').first();
		await expect(actionsButton).toBeVisible({ timeout: 15_000 });
		await actionsButton.click();

		await expect(page.getByTestId('order-delete-menu-item')).toBeVisible({ timeout: 15_000 });
	});
});

/**
 * Free users should see the blurred preview overlay when navigating to Orders.
 */
test.describe('Orders Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show upgrade overlay on Orders', async ({ posPage: page }) => {
		await navigateToPage(page, 'orders');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button on upgrade overlay', async ({ posPage: page }) => {
		await navigateToPage(page, 'orders');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('view-demo-button')).toBeVisible();
	});
});
