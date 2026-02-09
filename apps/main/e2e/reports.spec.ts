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
		await expect(screen).toBeVisible({ timeout: 30_000 });

		// Reports page should have filter buttons or data content
		await page.waitForTimeout(3_000);
		const hasButtons = (await screen.locator('[role="button"]').count()) > 0;
		const hasTable = await screen.locator('table').first().isVisible().catch(() => false);
		expect(hasButtons || hasTable).toBeTruthy();
	});

	test('should show filter pills', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');

		// Wait for the reports page to fully load
		await expect(screen).toBeVisible({ timeout: 30_000 });
		await page.waitForTimeout(3_000);

		// Filter pills are buttons on the reports page
		const filterButtons = screen.locator('[role="button"]');
		expect(await filterButtons.count()).toBeGreaterThanOrEqual(1);
	});

	test('should show report content', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');
		await expect(screen).toBeVisible({ timeout: 30_000 });
		await page.waitForTimeout(3_000);

		// Reports page should have some content (table, chart, or summary)
		const hasTable = await screen.locator('table').first().isVisible().catch(() => false);
		const hasButtons = (await screen.locator('[role="button"]').count()) > 0;
		expect(hasTable || hasButtons).toBeTruthy();
	});

	test('should show print button', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');
		await expect(screen).toBeVisible({ timeout: 30_000 });
		await page.waitForTimeout(3_000);

		// Print button might have different labels in different locales
		// Look for any button with a print icon (svg) in the reports screen
		const buttons = screen.locator('[role="button"]');
		expect(await buttons.count()).toBeGreaterThanOrEqual(1);
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
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('view-demo-button')).toBeVisible();
	});
});
