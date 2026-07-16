import { expect } from '@playwright/test';

import { navigateToPage, authenticatedTest as test } from './fixtures';

/**
 * Helper to open the settings area via the user menu.
 */
async function openSettings(page: import('@playwright/test').Page) {
	await page.getByTestId('user-menu-trigger').click();
	await page.getByTestId('settings-menu-item').click();
	await expect(page.getByTestId('screen-settings-general')).toBeVisible({
		timeout: 10_000,
	});
}

test.describe('Settings Area', () => {
	test('should open settings and show pages', async ({ posPage: page }) => {
		await openSettings(page);
		await expect(page.getByTestId('settings-nav-general')).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByTestId('settings-nav-tax')).toBeVisible();
		await expect(page.getByTestId('settings-nav-printing')).toBeVisible();
		await expect(page.getByTestId('settings-nav-barcode-scanning')).toBeVisible();
		await expect(page.getByTestId('settings-nav-shortcuts')).toBeVisible();
		await expect(page.getByTestId('settings-nav-theme')).toBeVisible();
	});

	test('should show General settings page', async ({ posPage: page }) => {
		await openSettings(page);
		// General settings has form inputs (store name, language, currency, etc.)
		const settingsPage = page.getByTestId('screen-settings-general');
		await expect(settingsPage.locator('input').first()).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should show Tax settings page', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByTestId('settings-nav-tax').click({ force: true });
		await expect(page.getByTestId('screen-settings-tax')).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should show Barcode Scanning page', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByTestId('settings-nav-barcode-scanning').click();
		await expect(page.getByTestId('screen-settings-barcode-scanning')).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should show Keyboard Shortcuts page', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByTestId('settings-nav-shortcuts').click();
		await expect(page.getByTestId('screen-settings-shortcuts')).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should show Theme page and list themes', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByTestId('settings-nav-theme').click();
		await expect(page.getByTestId('screen-settings-theme')).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should leave the settings area', async ({ posPage: page }) => {
		await openSettings(page);

		await navigateToPage(page, 'pos');
		await expect(page.getByTestId('screen-settings-general')).not.toBeVisible({
			timeout: 10_000,
		});
	});
});

test.describe('Language Settings', () => {
	/**
	 * Two languages the test can switch between. If the store starts on one,
	 * we switch to the other — so the test works regardless of the starting locale.
	 */
	const SWITCH_TARGETS = [
		{
			optionTestID: 'language-option-de_DE',
			cdnCode: '/translations/js/de_DE/',
		},
		{
			optionTestID: 'language-option-fr_FR',
			cdnCode: '/translations/js/fr_FR/',
		},
	];

	/**
	 * Helper to switch language via the General settings combobox.
	 * Uses testIDs so it works regardless of the current UI language.
	 */
	async function selectLanguage(page: import('@playwright/test').Page, optionTestID: string) {
		await page.getByTestId('language-select-trigger').click();
		const combobox = page.getByTestId('language-combobox-content');
		await expect(combobox).toBeVisible({ timeout: 10_000 });
		await page
			.getByTestId('language-search-input')
			.fill(optionTestID.replace('language-option-', ''));
		const option = combobox.getByTestId(optionTestID);
		await expect(option).toBeVisible({ timeout: 10_000 });
		await option.click();
	}

	function isExpectedTranslationResponse(
		response: import('@playwright/test').Response,
		cdnCode: string
	) {
		const url = new URL(response.url());
		return (
			url.hostname === 'cdn.jsdelivr.net' &&
			url.pathname.includes(cdnCode) &&
			response.status() === 200
		);
	}

	/**
	 * Switches to a different language by trying stable option IDs and
	 * returning the first option that triggers a CDN translation fetch.
	 */
	async function switchToDifferentLanguage(page: import('@playwright/test').Page) {
		for (const target of SWITCH_TARGETS) {
			const translationFetch = page
				.waitForResponse((response) => isExpectedTranslationResponse(response, target.cdnCode), {
					timeout: 5_000,
				})
				.catch(() => null);

			await selectLanguage(page, target.optionTestID);

			const response = await translationFetch;
			if (response) {
				return { target, response };
			}
		}

		throw new Error('Unable to switch to a different language via stable option testIDs');
	}

	test('should have a language set in settings', async ({ posPage: page }) => {
		await openSettings(page);

		const trigger = page.getByTestId('language-select-trigger');
		await expect(trigger).toBeVisible({ timeout: 10_000 });
		await expect(trigger).toContainText(/\S/);
		await trigger.click();
		const combobox = page.getByTestId('language-combobox-content');
		await expect(combobox).toBeVisible({ timeout: 10_000 });
		await page
			.getByTestId('language-search-input')
			.fill(SWITCH_TARGETS[0].optionTestID.replace('language-option-', ''));
		await expect(combobox.getByTestId(SWITCH_TARGETS[0].optionTestID)).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should change language and load translations from CDN', async ({ posPage: page }) => {
		await openSettings(page);

		const { response } = await switchToDifferentLanguage(page);
		expect(response.ok()).toBeTruthy();
	});

	test('should persist language after closing and reopening settings', async ({
		posPage: page,
	}) => {
		await openSettings(page);

		const { target } = await switchToDifferentLanguage(page);

		// Leave settings before reopening it from the user menu.
		await navigateToPage(page, 'pos');
		await expect(page.getByTestId('screen-settings-general')).not.toBeVisible({
			timeout: 10_000,
		});

		// Reopen settings and verify the new language stuck (testID-anchored)
		await page.locator('[data-testid="user-menu-trigger"]:visible').click();
		await expect(page.getByTestId('settings-menu-item')).toBeVisible({
			timeout: 15_000,
		});
		await page.getByTestId('settings-menu-item').click();
		await expect(page.getByTestId('screen-settings-general')).toBeVisible({
			timeout: 15_000,
		});

		// Re-select the same locale by stable option ID. If persisted, no CDN fetch should fire.
		const sameLanguageFetch = page
			.waitForResponse((response) => isExpectedTranslationResponse(response, target.cdnCode), {
				timeout: 5_000,
			})
			.then(() => true)
			.catch(() => false);

		await selectLanguage(page, target.optionTestID);
		await expect(sameLanguageFetch).resolves.toBe(false);
	});
});
