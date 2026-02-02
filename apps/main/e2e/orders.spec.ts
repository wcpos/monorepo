import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant } from './fixtures';

/**
 * Orders page (pro-only).
 */
test.describe('Orders Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Orders page requires Pro');
	});

	test('should navigate to Orders page and see order list', async ({ posPage: page }) => {
		await page.getByText('Orders', { exact: true }).click();
		await expect(page.getByPlaceholder('Search Orders')).toBeVisible({ timeout: 30_000 });
	});

	test('should show order columns', async ({ posPage: page }) => {
		await page.getByText('Orders', { exact: true }).click();
		await expect(page.getByPlaceholder('Search Orders')).toBeVisible({ timeout: 30_000 });

		await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'Total' })).toBeVisible();
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
});
