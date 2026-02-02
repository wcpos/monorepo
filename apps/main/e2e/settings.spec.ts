import { expect } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

/**
 * Helper to open settings modal via user menu.
 */
async function openSettings(page: import('@playwright/test').Page) {
	const userMenuTrigger = page.getByRole('button').filter({ hasText: /demo/i }).first();
	if (await userMenuTrigger.isVisible({ timeout: 5_000 }).catch(() => false)) {
		await userMenuTrigger.click();
		await page.getByText('Settings').first().click();
	}
}

test.describe('Settings Modal', () => {
	test('should open settings and show tabs', async ({ posPage: page }) => {
		await openSettings(page);
		// Settings modal should have multiple tabs
		await expect(page.getByText('General').first()).toBeVisible({ timeout: 10_000 });
	});

	test('should show General settings tab', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByText('General').first().click();
		// General tab should show locale/currency related settings
		await expect(
			page.getByText(/currency|locale|language/i).first()
		).toBeVisible({ timeout: 10_000 });
	});

	test('should show Tax settings tab', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByText('Tax').first().click();
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

		// Theme tab should list available themes
		await expect(page.getByText('Light').first()).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText('Dark').first()).toBeVisible({ timeout: 10_000 });
	});

	test('should close settings modal', async ({ posPage: page }) => {
		await openSettings(page);
		await expect(page.getByText('General').first()).toBeVisible({ timeout: 10_000 });

		// Close the modal
		await page.getByRole('button', { name: /close/i }).first().click();
		// Should return to POS
		await expect(page.getByPlaceholder('Search Products')).toBeVisible({ timeout: 10_000 });
	});
});
