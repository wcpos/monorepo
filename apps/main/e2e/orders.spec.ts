import { expect, type Page } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant } from './fixtures';

/** Helper to navigate to Orders page and wait for load */
async function navigateToOrders(page: Page) {
	await page.getByText('Orders', { exact: true }).click();
	await expect(page.getByPlaceholder('Search Orders')).toBeVisible({ timeout: 30_000 });
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
		await navigateToOrders(page);

		await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'Total' })).toBeVisible();
	});

	test('should show orders or empty state', async ({ posPage: page }) => {
		await navigateToOrders(page);

		const hasOrders = await page
			.getByText(/Showing \d+ of \d+/)
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		const noOrders = await page
			.getByText('No orders found')
			.isVisible({ timeout: 5_000 })
			.catch(() => false);
		expect(hasOrders || noOrders).toBeTruthy();
	});

	test('should search orders', async ({ posPage: page }) => {
		await navigateToOrders(page);

		const searchInput = page.getByPlaceholder('Search Orders');
		await searchInput.fill('123');
		await page.waitForTimeout(1_500);

		const hasResults = await page
			.getByText(/Showing \d+ of \d+/)
			.isVisible()
			.catch(() => false);
		const noResults = await page
			.getByText('No orders found')
			.isVisible()
			.catch(() => false);
		expect(hasResults || noResults).toBeTruthy();
	});

	test('should show filter pills', async ({ posPage: page }) => {
		await navigateToOrders(page);

		// Orders page has filter pills for Status, Customer, Cashier, etc.
		await expect(page.getByText('Status').first()).toBeVisible({ timeout: 5_000 });
	});

	test('should show order actions menu', async ({ posPage: page }) => {
		await navigateToOrders(page);

		// Wait for orders to load
		const hasOrders = await page
			.getByText(/Showing [1-9]\d* of \d+/)
			.isVisible({ timeout: 15_000 })
			.catch(() => false);

		if (hasOrders) {
			// Click the first ellipsis actions menu
			const ellipsis = page.getByRole('button', { name: /more|actions|menu/i }).first();
			if (await ellipsis.isVisible({ timeout: 5_000 }).catch(() => false)) {
				await ellipsis.click();
				await expect(
					page.getByText('Edit').or(page.getByText('Re-open')).or(page.getByText('Delete'))
				).toBeVisible({ timeout: 5_000 });
			}
		}
	});
});

/**
 * Free users should see upgrade page.
 */
test.describe('Orders Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show upgrade page on Orders', async ({ posPage: page }) => {
		await page.getByText('Orders', { exact: true }).click();
		await expect(page.getByText('Upgrade to Pro')).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button', async ({ posPage: page }) => {
		await page.getByText('Orders', { exact: true }).click();
		await expect(page.getByText('Upgrade to Pro')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('button', { name: 'View Demo' })).toBeVisible();
	});
});
