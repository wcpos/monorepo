import { expect } from '@playwright/test';

import { getStoreVariant, authenticatedTest as test } from './fixtures';

test.describe('Header', () => {
	test('should show user menu trigger', async ({ posPage: page }) => {
		await expect(page.getByTestId('user-menu-trigger')).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should open user menu dropdown', async ({ posPage: page }) => {
		await page.getByTestId('user-menu-trigger').click();
		await expect(page.getByTestId('settings-menu-item')).toBeVisible({
			timeout: 15_000,
		});
	});

	test('should open settings modal from user menu', async ({ posPage: page }) => {
		await page.getByTestId('user-menu-trigger').click();
		await expect(page.getByTestId('settings-menu-item')).toBeVisible({
			timeout: 15_000,
		});
		await page.getByTestId('settings-menu-item').click();
		await expect(page.getByTestId('settings-tab-general')).toBeVisible({
			timeout: 15_000,
		});
	});
});

test.describe('Upgrade Banner (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade banner only for free stores');
	});

	test('should show upgrade banner for free users', async ({ posPage: page }) => {
		await expect(page.getByTestId('upgrade-notice-banner')).toBeVisible({
			timeout: 10_000,
		});
	});
});
