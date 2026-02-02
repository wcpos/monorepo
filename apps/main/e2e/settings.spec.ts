import { expect } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

/**
 * Helper to open settings modal via user menu.
 */
async function openSettings(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: /Demo Cashier/i }).click();
	await page.getByText('Settings').first().click();
	await expect(page.getByText('General').first()).toBeVisible({ timeout: 10_000 });
}

test.describe('Settings Modal', () => {
	test('should open settings and show tabs', async ({ posPage: page }) => {
		await openSettings(page);
		await expect(page.getByText('General').first()).toBeVisible({ timeout: 10_000 });
	});

	test('should show General settings tab', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByText('General').first().click();
		await expect(
			page.getByText(/currency|locale|language/i).first()
		).toBeVisible({ timeout: 10_000 });
	});

	test('should show Tax settings tab', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByText('Tax').first().click({ force: true });
		await expect(page.getByText(/tax/i).first()).toBeVisible({ timeout: 10_000 });
	});

	test('should show Barcode Scanning tab', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByText('Barcode').first().click();
		await expect(page.getByText(/barcode|scanner/i).first()).toBeVisible({ timeout: 10_000 });
	});

	test('should show Keyboard Shortcuts tab', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByText('Keyboard').first().click();
		await expect(page.getByText(/shortcut|key/i).first()).toBeVisible({ timeout: 10_000 });
	});

	test('should show Theme tab and list themes', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByText('Theme').first().click();

		await expect(page.getByText('Light').first()).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText('Dark').first()).toBeVisible({ timeout: 10_000 });
	});

	test('should close settings modal', async ({ posPage: page }) => {
		await openSettings(page);

		await page.getByRole('button', { name: /close/i }).first().click();
		await expect(page.getByPlaceholder('Search Products')).toBeVisible({ timeout: 10_000 });
	});
});
