import { test, expect } from '@playwright/test';
import { authenticatedTest } from './fixtures';

/**
 * Navigation and layout tests.
 */
test.describe('Unauthenticated Navigation', () => {
	test('should show connect screen when not logged in', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible({ timeout: 60_000 });
		await expect(page.locator('input[type="url"]')).toBeVisible();
	});

	test('should handle unknown routes gracefully', async ({ page }) => {
		await page.goto('/some-nonexistent-route');

		// Wait for the app to finish loading, then check for connect screen or 404
		await expect(
			page.getByRole('button', { name: 'Connect' }).or(page.getByText(/doesn't exist/i))
		).toBeVisible({ timeout: 120_000 });
	});
});

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
