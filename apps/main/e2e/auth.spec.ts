import { test, expect } from '@playwright/test';
import { STORE_URL } from './fixtures';

/**
 * Authentication tests for the connect screen (unauthenticated).
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
