import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant, navigateToPage } from './fixtures';

/**
 * Reports page (pro-only).
 */
test.describe('Reports Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Reports page requires Pro');
	});

	test('should navigate to Reports page', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');

		const hasContent = await screen
			.getByText(/No orders found|Showing \d+ of \d+/)
			.first()
			.isVisible({ timeout: 30_000 })
			.catch(() => false);
		const hasSearch = await screen
			.getByPlaceholder('Search Orders')
			.isVisible({ timeout: 5_000 })
			.catch(() => false);

		expect(hasContent || hasSearch).toBeTruthy();
	});

	test('should show filter pills', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');
		await page.waitForTimeout(5_000);

		await expect(screen.getByText('Status').first()).toBeVisible({ timeout: 10_000 });
	});

	test('should show report summary section', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');
		await page.waitForTimeout(5_000);

		await expect(screen.getByText('Report').first()).toBeVisible({ timeout: 10_000 });
	});

	test('should show print button', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');

		await expect(screen.getByRole('button', { name: /print/i })).toBeVisible({ timeout: 15_000 });
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
		await navigateToPage(page, 'reports');
		await expect(page.getByText('Upgrade to Pro', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		await expect(page.getByText('Upgrade to Pro', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('button', { name: 'View Demo' })).toBeVisible();
	});
});
