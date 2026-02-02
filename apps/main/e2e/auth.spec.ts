import { test, expect } from '@playwright/test';
import { STORE_URL } from './fixtures';

/**
 * Unauthenticated tests: connect screen and basic navigation.
 * These run without the setup project (no storageState).
 */
test.describe('Connect Screen', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible({ timeout: 60_000 });
	});

	test('should display the URL input and connect button', async ({ page }) => {
		await expect(page.locator('input[type="url"]')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Enter Demo Store' })).toBeVisible();
	});

	test('should have the connect button disabled when URL is empty', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Connect' })).toBeDisabled();
	});

	test('should enable the connect button when a URL is entered', async ({ page }) => {
		await page.locator('input[type="url"]').fill('https://example.com');
		await expect(page.getByRole('button', { name: 'Connect' })).toBeEnabled();
	});

	test('should not connect to invalid store URL', async ({ page }) => {
		await page.locator('input[type="url"]').fill('https://example.com');
		await page.getByRole('button', { name: 'Connect' }).click();

		// After trying to connect, the store card should NOT appear
		await expect(page.getByText('Logged in users:')).not.toBeVisible({ timeout: 15_000 });
	});

	test('should connect to store and show site card', async ({ page }) => {
		const urlInput = page.getByRole('textbox', { name: /Enter the URL/i });
		await urlInput.click();
		await urlInput.fill(STORE_URL);
		await page.waitForTimeout(1_000);

		const connectButton = page.getByRole('button', { name: 'Connect' });
		await expect(connectButton).toBeEnabled({ timeout: 10_000 });
		await connectButton.click();

		await expect(page.getByText('Logged in users:')).toBeVisible({ timeout: 30_000 });
	});
});

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
		).toBeVisible({ timeout: 60_000 });
	});
});
