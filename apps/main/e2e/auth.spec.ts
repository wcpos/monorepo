import { test, expect, type TestInfo } from '@playwright/test';
import type { WcposTestOptions } from '../playwright.config';

function getStoreUrl(testInfo: TestInfo): string {
	if (process.env.E2E_STORE_URL) return process.env.E2E_STORE_URL;
	const opts = testInfo.project.use as WcposTestOptions;
	return opts.storeUrl || 'https://dev-free.wcpos.com';
}

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

		await expect(page.getByText('Logged in users:')).not.toBeVisible({ timeout: 15_000 });
	});

	test('should connect to store and show site card', async ({ page }, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const urlInput = page.getByRole('textbox', { name: /Enter the URL/i });
		await urlInput.click();
		await urlInput.fill(storeUrl);
		await page.waitForTimeout(1_000);

		const connectButton = page.getByRole('button', { name: 'Connect' });
		await expect(connectButton).toBeEnabled({ timeout: 10_000 });
		await connectButton.click();

		await expect(page.getByText('Logged in users:')).toBeVisible({ timeout: 30_000 });
	});

	test('should show add user button after store discovery', async ({ page }, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const urlInput = page.getByRole('textbox', { name: /Enter the URL/i });
		await urlInput.click();
		await urlInput.fill(storeUrl);
		await page.waitForTimeout(1_000);

		await page.getByRole('button', { name: 'Connect' }).click();
		await expect(page.getByText('Logged in users:')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('add-user-button')).toBeVisible();
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

		await expect(
			page.getByRole('button', { name: 'Connect' }).or(page.getByText(/doesn't exist/i))
		).toBeVisible({ timeout: 60_000 });
	});
});
