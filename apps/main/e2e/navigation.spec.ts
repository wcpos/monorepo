import { expect } from '@playwright/test';
import { authenticatedTest } from './fixtures';

/**
 * Authenticated navigation and layout tests.
 */
authenticatedTest.describe('Authenticated Navigation', () => {
	authenticatedTest('should show the POS screen after login', async ({ posPage: page }) => {
		await expect(page.getByPlaceholder('Search Products')).toBeVisible();
	});

	authenticatedTest('should be responsive on mobile viewport', async ({ posPage: page }) => {
		await page.setViewportSize({ width: 375, height: 667 });

		// On mobile, either search input or Products tab should be visible
		await expect(page.getByPlaceholder('Search Products')).toBeVisible({ timeout: 10_000 });
	});

	authenticatedTest('should be responsive on desktop viewport', async ({ posPage: page }) => {
		await page.setViewportSize({ width: 1920, height: 1080 });

		await expect(page.getByPlaceholder('Search Products')).toBeVisible();
		await expect(page.getByText('Guest')).toBeVisible();
	});
});
