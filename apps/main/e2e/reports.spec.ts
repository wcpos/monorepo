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

	// The Sales room (roadmap#332) replaced the filtered order report: scope lives in the hero's
	// chips, the figures in the period cards, and printing on the hero's own button.
	test('should show the scope chips', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');
		await expect(screen).toBeVisible({ timeout: 30_000 });
		await expect(screen.getByTestId('hero-chips')).toBeVisible({ timeout: 30_000 });
	});

	test('should show the period cards', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');
		await expect(screen).toBeVisible({ timeout: 30_000 });
		await expect(screen.getByTestId('reports-period-section')).toBeVisible({ timeout: 30_000 });
	});

	test('should show print button', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');
		await expect(screen).toBeVisible({ timeout: 30_000 });
		await expect(screen.getByTestId('hero-print')).toBeVisible({ timeout: 30_000 });
	});
});

/**
 * Free has the Sales room too, held to today and the bound register (reports/index.tsx); the
 * blurred upgrade overlay no longer guards the route. reports-closures covers the locked dates.
 */
test.describe('Reports Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Free-only view of the Sales room');
	});

	test('should show the day report, not an upgrade overlay', async ({ posPage: page }) => {
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports');
		await expect(screen).toBeVisible({ timeout: 30_000 });
		await expect(screen.getByTestId('reports-period-section')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('upgrade-title')).toHaveCount(0);
	});
});
