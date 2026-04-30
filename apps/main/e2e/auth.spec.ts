import { expect, test } from '@playwright/test';

import { getStoreUrl } from './fixtures';

test.describe('Connect Screen', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('connect-store-button')).toBeVisible({
			timeout: 60_000,
		});
	});

	test('should display the URL input and connect button', async ({ page }) => {
		await expect(page.getByTestId('store-url-input')).toBeVisible();
		await expect(page.getByTestId('connect-store-button')).toBeVisible();
		await expect(page.getByTestId('enter-demo-store-button')).toBeVisible();
	});

	test('should have the connect button disabled when URL is empty', async ({ page }) => {
		await expect(page.getByTestId('connect-store-button')).toBeDisabled();
	});

	test('should enable the connect button when a URL is entered', async ({ page }) => {
		await page.getByTestId('store-url-input').fill('https://example.com');
		await expect(page.getByTestId('connect-store-button')).toBeEnabled();
	});

	test('should not connect to invalid store URL', async ({ page }) => {
		await page.getByTestId('store-url-input').fill('https://example.com');
		await page.getByTestId('connect-store-button').click();

		await expect(page.getByTestId('logged-in-users-label')).not.toBeVisible({
			timeout: 15_000,
		});
	});

	test('should connect to store and show site card', async ({ page }, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const urlInput = page.getByTestId('store-url-input');
		await urlInput.click();
		await urlInput.fill(storeUrl);
		await page.waitForTimeout(1_000);

		const connectButton = page.getByTestId('connect-store-button');
		await expect(connectButton).toBeEnabled({ timeout: 10_000 });
		await connectButton.click();

		await expect(page.getByTestId('logged-in-users-label')).toBeVisible({
			timeout: 30_000,
		});
	});

	test('should show add user button after store discovery', async ({ page }, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const urlInput = page.getByTestId('store-url-input');
		await urlInput.click();
		await urlInput.fill(storeUrl);
		await page.waitForTimeout(1_000);

		await page.getByTestId('connect-store-button').click();
		await expect(page.getByTestId('logged-in-users-label')).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByTestId('add-user-button')).toBeVisible();
	});
});

test.describe('Unauthenticated Navigation', () => {
	test('should show connect screen when not logged in', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('connect-store-button')).toBeVisible({
			timeout: 60_000,
		});
		await expect(page.getByTestId('store-url-input')).toBeVisible();
	});

	test('should handle unknown routes gracefully', async ({ page }) => {
		await page.goto('/some-nonexistent-route');

		await expect(
			page.getByTestId('connect-store-button').or(page.getByTestId('not-found-screen'))
		).toBeVisible({ timeout: 60_000 });
	});
});
