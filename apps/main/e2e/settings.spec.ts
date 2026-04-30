import { expect } from '@playwright/test';

import { authenticatedTest as test } from './fixtures';

/**
 * Helper to open settings modal via user menu.
 */
async function openSettings(page: import('@playwright/test').Page) {
	await page.getByTestId('user-menu-trigger').click();
	await page.getByTestId('settings-menu-item').click();
	await expect(page.getByTestId('settings-tab-general')).toBeVisible({
		timeout: 10_000,
	});
}

test.describe('Settings Modal', () => {
	test('should open settings and show tabs', async ({ posPage: page }) => {
		await openSettings(page);
		await expect(page.getByTestId('settings-tab-general')).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should show General settings tab', async ({ posPage: page }) => {
		await openSettings(page);
		await page.getByTestId('settings-tab-general').click();
		// General tab has form inputs (store name, language, currency, etc.)
		const tabPanel = page.getByRole('tabpanel');
		await expect(tabPanel.locator('input').first()).toBeVisible({
			timeout: 10_000,
		});
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
		await expect(page.getByTestId('settings-tab-general')).not.toBeVisible({
			timeout: 10_000,
		});
	});
});

test.describe('Language Settings', () => {
	type LanguageTarget = {
		optionTestID: string;
		value: string;
		cdnCode: string;
		label: string;
	};

	async function getSelectedLanguageText(page: import('@playwright/test').Page) {
		const trigger = page.getByTestId('language-select-trigger');
		await expect(trigger).toBeVisible({ timeout: 10_000 });
		const text = (await trigger.textContent())?.trim() ?? '';
		expect(text.length).toBeGreaterThan(0);
		return text;
	}

	async function getVisibleLanguageTargets(
		page: import('@playwright/test').Page
	): Promise<LanguageTarget[]> {
		await page.getByTestId('language-select-trigger').click();
		const combobox = page.getByTestId('language-combobox-content');
		await expect(combobox).toBeVisible({ timeout: 10_000 });
		const options = combobox.getByTestId(/language-option-/);
		await expect(options.first()).toBeVisible({ timeout: 10_000 });

		const targets: LanguageTarget[] = [];
		const count = await options.count();
		for (let i = 0; i < count; i++) {
			const option = options.nth(i);
			const optionTestID = await option.getAttribute('data-testid');
			const label = (await option.textContent())?.trim();
			if (!optionTestID?.startsWith('language-option-') || !label) continue;

			const value = optionTestID.slice('language-option-'.length);
			targets.push({
				optionTestID,
				value,
				cdnCode: `/translations/js/${value}/`,
				label,
			});
		}

		await page.keyboard.press('Escape');
		return targets;
	}

	async function selectLanguage(page: import('@playwright/test').Page, target: LanguageTarget) {
		await page.getByTestId('language-select-trigger').click();
		const combobox = page.getByTestId('language-combobox-content');
		await expect(combobox).toBeVisible({ timeout: 10_000 });
		const input = page.getByTestId('language-search-input');
		const option = combobox.getByTestId(target.optionTestID);
		await input.fill(target.value);
		if (!(await option.isVisible({ timeout: 2_000 }).catch(() => false))) {
			await input.fill(target.label);
		}
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
	 * Switches to a different visible language option and
	 * returning the first option that triggers a CDN translation fetch.
	 */
	async function switchToDifferentLanguage(page: import('@playwright/test').Page) {
		const currentLanguageText = await getSelectedLanguageText(page);
		const targets = await getVisibleLanguageTargets(page);

		const candidates = targets.filter((target) => target.label !== currentLanguageText);

		for (const target of candidates.length ? candidates : targets) {
			const translationFetch = page
				.waitForResponse((response) => isExpectedTranslationResponse(response, target.cdnCode), {
					timeout: 5_000,
				})
				.catch(() => null);

			await selectLanguage(page, target);

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
		await getSelectedLanguageText(page);
		await trigger.click();
		const combobox = page.getByTestId('language-combobox-content');
		await expect(combobox).toBeVisible({ timeout: 10_000 });
		await expect(combobox.getByRole('option').first()).toBeVisible();
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

		// Close settings modal
		await page.goBack();
		await expect(page.getByTestId('settings-tab-general')).not.toBeVisible({
			timeout: 10_000,
		});

		// Reopen settings and verify the new language stuck (testID-anchored)
		await page.getByTestId('user-menu-trigger').click();
		await expect(page.getByTestId('settings-menu-item')).toBeVisible({
			timeout: 15_000,
		});
		await page.getByTestId('settings-menu-item').click();

		// Re-select the same locale by stable option ID. If persisted, no CDN fetch should fire.
		const sameLanguageFetch = page
			.waitForResponse((response) => isExpectedTranslationResponse(response, target.cdnCode), {
				timeout: 5_000,
			})
			.then(() => true)
			.catch(() => false);

		await selectLanguage(page, target);
		await expect(sameLanguageFetch).resolves.toBe(false);
	});
});
