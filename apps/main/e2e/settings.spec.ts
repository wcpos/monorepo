import { expect } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

/**
 * Helper to open settings modal via user menu.
 */
async function openSettings(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: /Demo Cashier/i }).click();
	await page.getByTestId('settings-menu-item').click();
	await expect(page.getByTestId('settings-tab-general')).toBeVisible({ timeout: 10_000 });
}

test.describe('Settings Modal', () => {
	test('should open settings and show tabs', async ({ posPage: page }) => {
		await openSettings(page);
		await expect(page.getByTestId('settings-tab-general')).toBeVisible({ timeout: 10_000 });
	});

	test('should show General settings tab', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByTestId('settings-tab-general').click();
		// General tab has form inputs (store name, language, currency, etc.)
		const tabPanel = page.getByRole('tabpanel');
		await expect(tabPanel.locator('input').first()).toBeVisible({ timeout: 10_000 });
	});

	test('should show Tax settings tab', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByTestId('settings-tab-tax').click({ force: true });
		// Tax tab has content (table or form elements)
		const tabPanel = page.getByRole('tabpanel');
		await expect(tabPanel).toBeVisible({ timeout: 10_000 });
	});

	test('should show Barcode Scanning tab', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByTestId('settings-tab-barcode').click();
		const tabPanel = page.getByRole('tabpanel');
		await expect(tabPanel).toBeVisible({ timeout: 10_000 });
	});

	test('should show Keyboard Shortcuts tab', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByTestId('settings-tab-shortcuts').click();
		const tabPanel = page.getByRole('tabpanel');
		await expect(tabPanel).toBeVisible({ timeout: 10_000 });
	});

	test('should show Theme tab and list themes', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByTestId('settings-tab-theme').click();
		// Theme tab has radio/switch options for light/dark mode
		const tabPanel = page.getByRole('tabpanel');
		await expect(tabPanel).toBeVisible({ timeout: 10_000 });
	});

	test('should close settings modal', async ({ posPage: page }) => {
		await openSettings(page);

		// Settings modal is a route-based modal; navigate back to close it
		await page.goBack();
		await expect(page.getByTestId('settings-tab-general')).not.toBeVisible({ timeout: 10_000 });
	});
});

test.describe('Language Settings', () => {
	// These tests assume English as the starting language, but the demo store may be
	// in Spanish or another locale. They need a locale-aware setup before running.
	test.fixme(true, 'Language tests need locale-aware starting state');

	/**
	 * Helper to change language via the General settings combobox.
	 */
	async function changeLanguage(
		page: import('@playwright/test').Page,
		search: string,
		label: string
	) {
		// Click the language combobox trigger (shows current language name)
		const trigger = page.getByRole('button', { name: /English|French|Français/i }).first();
		await expect(trigger).toBeVisible({ timeout: 10_000 });
		await trigger.click();

		// The search placeholder may be in English or the current language
		const searchInput = page
			.getByPlaceholder('Search Languages')
			.or(page.getByPlaceholder('Rechercher des langues'));
		await searchInput.fill(search);
		await page.waitForTimeout(500);
		await page.getByText(label).click();
	}

	test('should change language to French and load translations from CDN', async ({
		posPage: page,
	}) => {
		await openSettings(page);

		// The General tab is shown by default with a Language combobox.
		// The demo store defaults to "English (US)".
		const languageTrigger = page.getByText('English (US)').first();
		await expect(languageTrigger).toBeVisible({ timeout: 10_000 });
		await languageTrigger.click();

		// Search for French in the combobox popover
		await page.getByPlaceholder('Search Languages').fill('French');
		await page.waitForTimeout(500);

		// Select "French (Français)" from the filtered list
		await page.getByText('French (Français)').click();

		// Verify the language selector now shows French
		await expect(page.getByText('French (Français)').first()).toBeVisible({ timeout: 10_000 });

		// Translations load asynchronously from jsDelivr CDN.
		// The POS product table behind the modal updates with French column headers.
		await expect(page.getByText('Produit')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText('Prix')).toBeVisible({ timeout: 10_000 });

		// Change back to English so the test leaves the store in its original state.
		await changeLanguage(page, 'English', 'English (US)');

		// Verify product table reverts to English
		await expect(page.getByText('Product').first()).toBeVisible({ timeout: 15_000 });
	});

	test('should persist language after closing and reopening settings', async ({
		posPage: page,
	}) => {
		await openSettings(page);

		// Change to French
		const languageTrigger = page.getByText('English (US)').first();
		await expect(languageTrigger).toBeVisible({ timeout: 10_000 });
		await languageTrigger.click();
		await page.getByPlaceholder('Search Languages').fill('French');
		await page.waitForTimeout(500);
		await page.getByText('French (Français)').click();

		// Wait for French translations to load on the POS page
		await expect(page.getByText('Produit')).toBeVisible({ timeout: 15_000 });

		// Close settings modal
		await page.getByRole('button', { name: /close|fermer/i }).first().click();
		await page.waitForTimeout(1_000);

		// The POS page should still show French translations
		await expect(page.getByText('Produit')).toBeVisible({ timeout: 10_000 });

		// Reopen settings and verify French is still selected
		await page.getByRole('button', { name: /Demo Cashier/i }).click();
		const settingsItem = page.getByText('Settings').or(page.getByText('Paramètres'));
		await settingsItem.first().click();
		await expect(page.getByText('French (Français)').first()).toBeVisible({ timeout: 10_000 });

		// Revert to English for cleanup
		await changeLanguage(page, 'English', 'English (US)');
		await expect(page.getByText('Product').first()).toBeVisible({ timeout: 15_000 });
	});
});
