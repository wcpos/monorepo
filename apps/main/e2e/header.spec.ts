import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant } from './fixtures';

test.describe('Header', () => {
	test('should show user menu trigger', async ({ posPage: page }) => {
		await expect(page.getByRole('button', { name: /Demo Cashier/i })).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should open user menu dropdown', async ({ posPage: page }) => {
		await page.getByRole('button', { name: /Demo Cashier/i }).click();
		await expect(page.getByText('Settings').first()).toBeVisible({ timeout: 5_000 });
	});

	test('should open settings modal from user menu', async ({ posPage: page }) => {
		await page.getByRole('button', { name: /Demo Cashier/i }).click();
		await page.getByText('Settings').first().click();
		await expect(page.getByText(/General|Tax|Barcode|Keyboard|Theme/).first()).toBeVisible({
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
		// Banner rotates between messages but all contain "Pro" and end with "!"
		const upgradeText = page.getByText(/Pro.*!/).first();
		await expect(upgradeText).toBeVisible({ timeout: 10_000 });
	});
});
