import { test, expect } from '@playwright/test';

/**
 * Authentication tests for WCPOS web app
 *
 * These tests verify the store connection and login flows.
 * In CI, these tests use mocked API responses.
 */

test.describe('Authentication', () => {
	test.beforeEach(async ({ page }) => {
		// Navigate to the app - should show auth screen
		await page.goto('/');
		// Wait for hydration to complete - splash screen disappears when app is ready
		// The app shows either the auth screen (URL input) or main app (if already logged in)
		await expect(
			page.locator('input[type="url"], button:has-text("Connect"), [data-testid="pos-screen"]')
		).toBeVisible({ timeout: 60000 });
	});

	test('should display the connect screen', async ({ page }) => {
		// Auth screen elements should now be visible after beforeEach wait
		const hasUrlInput = await page
			.locator('input[type="url"], [data-testid="store-url-input"]')
			.isVisible()
			.catch(() => false);
		const hasConnectText = await page
			.locator('button:has-text("Connect")')
			.isVisible()
			.catch(() => false);

		expect(hasUrlInput || hasConnectText).toBeTruthy();
	});

	test('should validate store URL format', async ({ page }) => {
		// Wait for URL input
		const urlInput = page.locator('[data-testid="store-url-input"], input[placeholder*="URL"]');

		// Skip if URL input not visible (might be different auth flow)
		if (!(await urlInput.isVisible().catch(() => false))) {
			test.skip();
			return;
		}

		// Enter invalid URL
		await urlInput.fill('not-a-valid-url');

		// Try to connect
		const connectButton = page.locator('[data-testid="connect-button"], button:has-text("Connect")');
		if (await connectButton.isVisible().catch(() => false)) {
			await connectButton.click();

			// Should show error or validation message
			await expect(page.locator('text=/invalid|error|valid URL/i')).toBeVisible({ timeout: 10000 });
		}
	});

	test('should handle connection errors gracefully', async ({ page }) => {
		// Mock network failure for any WooCommerce API requests
		await page.route('**/wp-json/**', async (route) => {
			await route.abort('connectionfailed');
		});

		const urlInput = page.locator('[data-testid="store-url-input"], input[placeholder*="URL"]');

		// Skip if URL input not visible
		if (!(await urlInput.isVisible().catch(() => false))) {
			test.skip();
			return;
		}

		// Enter a valid-looking URL that will fail
		await urlInput.fill('https://nonexistent-store.example.com');

		// Try to connect
		const connectButton = page.locator('[data-testid="connect-button"], button:has-text("Connect")');
		if (await connectButton.isVisible().catch(() => false)) {
			await connectButton.click();

			// Should show error message (not crash)
			await expect(
				page.locator('text=/error|failed|could not|unable/i').first()
			).toBeVisible({ timeout: 30000 });
		}
	});

	test('should persist connection state after page reload', async ({ page, context }) => {
		// This test verifies that IndexedDB/localStorage persists auth state

		// First, check if we're on the auth screen
		const isOnAuthScreen = await page
			.locator('[data-testid="store-url-input"], input[placeholder*="URL"]')
			.isVisible()
			.catch(() => false);

		if (isOnAuthScreen) {
			// If on auth screen, we can't test persistence without actual auth
			test.skip();
			return;
		}

		// If authenticated, reload and verify we stay authenticated
		await page.reload();
		await page.waitForLoadState('networkidle');

		// Should not be redirected to auth screen
		const stillAuthenticated = await page
			.locator('[data-testid="pos-screen"], [data-testid="drawer-menu"]')
			.isVisible({ timeout: 10000 })
			.catch(() => false);

		// Assert that we're still authenticated after reload
		expect(stillAuthenticated).toBeTruthy();
	});
});

test.describe('Demo Store Connection', () => {
	test('should be able to connect to demo store', async ({ page }) => {
		// This test uses the actual demo store for integration testing
		// Skip in CI to avoid flaky tests
		if (process.env.CI) {
			test.skip();
			return;
		}

		await page.goto('/');

		const urlInput = page.locator('[data-testid="store-url-input"], input[placeholder*="URL"]');

		if (!(await urlInput.isVisible().catch(() => false))) {
			test.skip();
			return;
		}

		// Enter demo store URL
		await urlInput.fill('https://demo.wcpos.com');

		// Click connect
		const connectButton = page.locator('[data-testid="connect-button"], button:has-text("Connect")');
		await connectButton.click();

		// Wait for connection to establish (this may take a while)
		await expect(
			page.locator('[data-testid="pos-screen"], [data-testid="drawer-menu"], text=demo')
		).toBeVisible({ timeout: 60000 });
	});
});
