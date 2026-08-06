import { expect } from '@playwright/test';

import { getStoreVariant, navigateToPage, authenticatedTest as test } from './fixtures';

/**
 * Coupons page (pro-only drawer page).
 */
test.describe('Coupons Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Coupons page requires Pro');
	});

	test('should navigate to Coupons page and see coupon list', async ({ posPage: page }) => {
		await navigateToPage(page, 'coupons');
		const screen = page.getByTestId('screen-coupons');
		await expect(screen.getByTestId('search-coupons')).toBeVisible({ timeout: 30_000 });
	});

	test('should show coupon data or empty state', async ({ posPage: page }) => {
		await navigateToPage(page, 'coupons');
		const screen = page.getByTestId('screen-coupons');
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
		const screen = page.getByTestId('screen-coupons');
		await expect(screen.getByTestId('search-coupons')).toBeVisible({ timeout: 30_000 });
		const countEl = screen.getByTestId('data-table-count');
		await expect(countEl).toBeVisible({ timeout: 30_000 });
		const initialCount = await countEl.textContent();
		await expect(screen.getByTestId(/^data-table-row-/).first()).toBeVisible({ timeout: 30_000 });

		const searchInput = screen.getByTestId('search-coupons');
		await searchInput.fill('test');

		const matchingRow = screen.getByTestId(/^data-table-row-/).first();
		await expect(matchingRow).toBeVisible({ timeout: 15_000 });
		await expect(matchingRow).toContainText(/test/i);
		await expect.poll(() => countEl.textContent(), { timeout: 15_000 }).not.toBe(initialCount);
	});

	test('should have add coupon button on Coupons page', async ({ posPage: page }) => {
		await navigateToPage(page, 'coupons');
		const screen = page.getByTestId('screen-coupons');
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
