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
	/**
	 * Two languages the test can switch between. If the store starts on one,
	 * we switch to the other — so the test works regardless of the starting locale.
	 */
	const SWITCH_TARGETS = [
		{ search: 'German', option: 'German (Deutsch)', triggerText: 'German', cdnCode: '/de' },
		{ search: 'French', option: 'French (Français)', triggerText: 'French', cdnCode: '/fr' },
	];

	/**
	 * Read the current language from the trigger, then return a target that's different.
	 */
	async function pickDifferentLanguage(page: import('@playwright/test').Page) {
		const currentText = await page.getByTestId('language-select-trigger').textContent();
		// Pick the first target whose trigger text does NOT appear in the current value
		const target = SWITCH_TARGETS.find((t) => !currentText?.includes(t.triggerText));
		if (!target) {
			throw new Error(`Current language "${currentText}" matches all switch targets`);
		}
		return target;
	}

	/**
	 * Helper to switch language via the General settings combobox.
	 * Uses testIDs so it works regardless of the current UI language.
	 * The option click is scoped to the combobox dropdown to avoid matching the trigger.
	 */
	async function selectLanguage(
		page: import('@playwright/test').Page,
		search: string,
		optionText: string
	) {
		await page.getByTestId('language-select-trigger').click();
		await page.getByTestId('language-search-input').fill(search);
		await page.waitForTimeout(500);
		// Scope to dropdown content so we don't match the trigger text
		await page.getByTestId('language-combobox-content').getByText(optionText).click();
	}

	test('should have a language set in settings', async ({ posPage: page }) => {
		await openSettings(page);

		// The trigger must show some language (not empty / not just the placeholder)
		const trigger = page.getByTestId('language-select-trigger');
		await expect(trigger).toBeVisible({ timeout: 10_000 });
		const text = await trigger.textContent();
		expect(text?.trim().length).toBeGreaterThan(0);
	});

	test('should change language and load translations from CDN', async ({ posPage: page }) => {
		await openSettings(page);

		// Read whatever language is currently set, then pick a different one
		const target = await pickDifferentLanguage(page);

		// Listen for the CDN fetch before clicking so we don't miss it
		const translationFetch = page.waitForResponse(
			(response) =>
				response.url().includes('jsdelivr.net') &&
				response.url().includes(target.cdnCode) &&
				response.status() === 200,
			{ timeout: 15_000 }
		);

		await selectLanguage(page, target.search, target.option);

		// Verify the trigger updated (testID-anchored)
		await expect(page.getByTestId('language-select-trigger')).toContainText(
			target.triggerText,
			{ timeout: 10_000 }
		);

		// Verify translations were actually fetched from the CDN
		const response = await translationFetch;
		expect(response.ok()).toBeTruthy();
	});

	test('should persist language after closing and reopening settings', async ({
		posPage: page,
	}) => {
		await openSettings(page);

		// Read whatever language is currently set, then pick a different one
		const target = await pickDifferentLanguage(page);

		const translationFetch = page.waitForResponse(
			(response) =>
				response.url().includes('jsdelivr.net') &&
				response.url().includes(target.cdnCode) &&
				response.status() === 200,
			{ timeout: 15_000 }
		);

		await selectLanguage(page, target.search, target.option);
		await translationFetch;

		// Close settings modal
		await page.goBack();
		await page.waitForTimeout(1_000);

		// Reopen settings and verify the new language stuck (testID-anchored)
		await page.getByRole('button', { name: /Demo Cashier/i }).click();
		await expect(page.getByTestId('settings-menu-item')).toBeVisible({ timeout: 15_000 });
		await page.getByTestId('settings-menu-item').click();
		await expect(page.getByTestId('language-select-trigger')).toContainText(
			target.triggerText,
			{ timeout: 10_000 }
		);
	});
});
