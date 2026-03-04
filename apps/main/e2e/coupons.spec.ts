import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant, navigateToPage } from './fixtures';

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

		const hasCoupons = await screen
			.getByTestId('data-table-count')
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		const noCoupons = await screen
			.getByTestId('no-data-message')
			.isVisible({ timeout: 15_000 })
			.catch(() => false);
		expect(hasCoupons || noCoupons).toBeTruthy();
	});

	test('should search coupons', async ({ posPage: page }) => {
		await navigateToPage(page, 'coupons');
		const screen = page.getByTestId('screen-coupons');
		await expect(screen.getByTestId('search-coupons')).toBeVisible({ timeout: 30_000 });

		const searchInput = screen.getByTestId('search-coupons');
		await searchInput.fill('test');

		await expect
			.poll(
				async () => {
					const countEl = screen.getByTestId('data-table-count');
					const hasResults = await countEl
						.isVisible()
						.then(
							async (visible) =>
								visible && /[0-9]/.test((await countEl.textContent()) ?? '')
						)
						.catch(() => false);
					const noResults = await screen
						.getByTestId('no-data-message')
						.isVisible()
						.catch(() => false);
					return hasResults || noResults;
				},
				{ timeout: 15_000 }
			)
			.toBeTruthy();
	});

	test('should have add coupon button on Coupons page', async ({ posPage: page }) => {
		await navigateToPage(page, 'coupons');
		const screen = page.getByTestId('screen-coupons');
		await expect(screen.getByTestId('search-coupons')).toBeVisible({ timeout: 30_000 });

		// The add coupon button is an IconButton next to the search
		const headerButtons = screen.locator('[role="button"]');
		const buttonCount = await headerButtons.count();

		// Should have at least 2 buttons in the header (add coupon + settings)
		expect(buttonCount).toBeGreaterThanOrEqual(2);
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
