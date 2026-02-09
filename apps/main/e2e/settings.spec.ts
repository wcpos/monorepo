import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant } from './fixtures';
import type { StoreVariant } from '../playwright.config';

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
	 * Expected starting locale per store variant.
	 * These match the demo store configurations captured in the IndexedDB snapshots.
	 */
	const STORE_LOCALE: Record<StoreVariant, { triggerText: string; cdnCode: string }> = {
		free: { triggerText: 'French', cdnCode: 'fr' },
		pro: { triggerText: 'Spanish', cdnCode: 'es' },
	};

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

	test('should show the correct starting language for this store variant', async ({
		posPage: page,
	}) => {
		const variant = getStoreVariant(test.info());
		const expected = STORE_LOCALE[variant];

		await openSettings(page);

		// The language trigger must show the store's configured locale
		await expect(page.getByTestId('language-select-trigger')).toContainText(
			expected.triggerText,
			{ timeout: 10_000 }
		);
	});

	test('should change language and load translations from CDN', async ({ posPage: page }) => {
		const variant = getStoreVariant(test.info());
		const expected = STORE_LOCALE[variant];

		await openSettings(page);

		// Verify the starting language matches the store's configured locale
		await expect(page.getByTestId('language-select-trigger')).toContainText(
			expected.triggerText,
			{ timeout: 10_000 }
		);

		// Switch to German — neither demo store defaults to it, so a CDN fetch always happens
		const translationFetch = page.waitForResponse(
			(response) =>
				response.url().includes('jsdelivr.net') &&
				response.url().includes('/de') &&
				response.status() === 200,
			{ timeout: 15_000 }
		);

		await selectLanguage(page, 'German', 'German (Deutsch)');

		// Verify the trigger updated (testID-anchored)
		await expect(page.getByTestId('language-select-trigger')).toContainText('German', {
			timeout: 10_000,
		});

		// Verify translations were actually fetched from the CDN
		const response = await translationFetch;
		expect(response.ok()).toBeTruthy();
	});

	test('should persist language after closing and reopening settings', async ({
		posPage: page,
	}) => {
		const variant = getStoreVariant(test.info());
		const expected = STORE_LOCALE[variant];

		await openSettings(page);

		// Verify the starting language matches the store's configured locale
		await expect(page.getByTestId('language-select-trigger')).toContainText(
			expected.triggerText,
			{ timeout: 10_000 }
		);

		// Switch to German and wait for CDN fetch
		const translationFetch = page.waitForResponse(
			(response) =>
				response.url().includes('jsdelivr.net') &&
				response.url().includes('/de') &&
				response.status() === 200,
			{ timeout: 15_000 }
		);

		await selectLanguage(page, 'German', 'German (Deutsch)');
		await translationFetch;

		// Close settings modal
		await page.goBack();
		await page.waitForTimeout(1_000);

		// Reopen settings and verify German is still selected (testID-anchored)
		await page.getByRole('button', { name: /Demo Cashier/i }).click();
		await expect(page.getByTestId('settings-menu-item')).toBeVisible({ timeout: 15_000 });
		await page.getByTestId('settings-menu-item').click();
		await expect(page.getByTestId('language-select-trigger')).toContainText('German', {
			timeout: 10_000,
		});
	});
});
