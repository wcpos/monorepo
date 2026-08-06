import { expect } from '@playwright/test';

import { getStoreVariant, navigateToPage, authenticatedTest as test } from './fixtures';

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
		// Snapshot check after a fixed settle: `hasButtons` is an instantaneous count,
		// so a one-shot `isVisible()` for the table is the matching read (either
		// content marker satisfies the assertion). Not a branch decision on render.
		const hasButtons = (await screen.locator('[role="button"]').count()) > 0;
		const hasTable = await screen
			.locator('table')
			.first()
			.isVisible()
			.catch(() => false);
		expect(hasButtons || hasTable).toBeTruthy();
	});

	test('should show filter pills', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');

		// Wait for the reports page to fully load
		await expect(screen).toBeVisible({ timeout: 30_000 });
		await page.waitForTimeout(3_000);

		await expect(screen.getByTestId('order-filter-status')).toBeVisible({ timeout: 15_000 });
	});

	test('should show report content', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');
		await expect(screen).toBeVisible({ timeout: 30_000 });
		await page.waitForTimeout(3_000);

		await expect(screen.getByTestId('reports-content')).toBeVisible({ timeout: 15_000 });
	});

	test('should show print button', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');
		await expect(screen).toBeVisible({ timeout: 30_000 });
		await page.waitForTimeout(3_000);

		await expect(screen.getByTestId('reports-print-button')).toBeVisible({ timeout: 15_000 });
	});
});

/**
 * Free users should see the blurred preview overlay when navigating to Reports.
 */
test.describe('Reports Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show upgrade overlay on Reports', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button on upgrade overlay', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('view-demo-button')).toBeVisible();
	});
});
