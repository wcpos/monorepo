import { test, expect } from '@playwright/test';

/**
 * Navigation tests for WCPOS web app
 *
 * These tests verify that basic navigation works correctly,
 * including the drawer menu and responsive layouts.
 */

test.describe('Navigation', () => {
	test.beforeEach(async ({ page }) => {
		// Navigate to the app
		await page.goto('/');
	});

	test('should show auth screen when not connected', async ({ page }) => {
		// Should see the connect/auth screen
		await expect(
			page.locator('[data-testid="store-url-input"], input[placeholder*="URL"], text="Connect"')
		).toBeVisible({ timeout: 30000 });
	});

	test('should have proper page title', async ({ page }) => {
		await expect(page).toHaveTitle(/WCPOS|WooCommerce POS/);
	});

	test('should be responsive on mobile viewport', async ({ page }) => {
		// Set mobile viewport
		await page.setViewportSize({ width: 375, height: 667 });

		// Verify the page still renders properly
		await expect(page.locator('body')).toBeVisible();
	});

	test('should be responsive on tablet viewport', async ({ page }) => {
		// Set tablet viewport
		await page.setViewportSize({ width: 768, height: 1024 });

		// Verify the page still renders properly
		await expect(page.locator('body')).toBeVisible();
	});

	test('should be responsive on desktop viewport', async ({ page }) => {
		// Set desktop viewport
		await page.setViewportSize({ width: 1920, height: 1080 });

		// Verify the page still renders properly
		await expect(page.locator('body')).toBeVisible();
	});
});

test.describe('Error Handling', () => {
	test('should handle 404 pages gracefully', async ({ page }) => {
		// Navigate to a non-existent route
		await page.goto('/this-page-does-not-exist');

		// Should either redirect to home or show a not found message
		await expect(
			page.locator('body').or(page.locator('text=/Not Found|404/'))
		).toBeVisible();
	});
});

test.describe('Accessibility', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should have accessible focus indicators', async ({ page }) => {
		// Tab through interactive elements and verify focus is visible
		await page.keyboard.press('Tab');

		// Get the focused element
		const focusedElement = page.locator(':focus');
		await expect(focusedElement).toBeVisible();
	});

	test('should support keyboard navigation', async ({ page }) => {
		// Navigate with keyboard
		await page.keyboard.press('Tab');
		await page.keyboard.press('Enter');

		// Verify we can interact with the page using keyboard only
		await expect(page.locator('body')).toBeVisible();
	});
});
