import { expect } from '@playwright/test';

import { getStoreVariant, authenticatedTest as test } from './fixtures';

test.describe('Register bar (the POS has no title bar)', () => {
	test('should show the cashier avatar on the bar', async ({ posPage: page }) => {
		await expect(page.getByTestId('header-title-container')).toHaveCount(0);
		await expect(page.getByTestId('register-bar-avatar')).toBeVisible({
			timeout: 10_000,
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
