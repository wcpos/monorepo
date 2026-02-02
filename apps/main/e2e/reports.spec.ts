import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant } from './fixtures';

/**
 * Reports page (pro-only).
 */
test.describe('Reports Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Reports page requires Pro');
	});

	test('should navigate to Reports page', async ({ posPage: page }) => {
		await page.getByText('Reports', { exact: true }).click();

		// Reports page should show filter pills or the orders table
		const hasContent = await page
			.getByText(/No orders found|Showing \d+ of \d+/)
			.first()
			.isVisible({ timeout: 30_000 })
			.catch(() => false);
		const hasSearch = await page
			.getByPlaceholder('Search Orders')
			.isVisible({ timeout: 5_000 })
			.catch(() => false);

		expect(hasContent || hasSearch).toBeTruthy();
	});
});

/**
 * Free users should see upgrade page.
 */
test.describe('Reports Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show upgrade page on Reports', async ({ posPage: page }) => {
		await page.getByText('Reports', { exact: true }).click();
		await expect(page.getByText('Upgrade to Pro')).toBeVisible({ timeout: 30_000 });
	});
});
