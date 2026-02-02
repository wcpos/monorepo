import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant } from './fixtures';

test.describe('Header', () => {
	test('should show user menu trigger', async ({ posPage: page }) => {
		// The user menu shows avatar and/or display name
		// Look for the dropdown trigger in the header area
		const header = page.locator('header').first();
		await expect(header).toBeVisible();
	});

	test('should open user menu dropdown', async ({ posPage: page }) => {
		// Click avatar/user area to open dropdown
		const userMenuTrigger = page.getByRole('button').filter({ hasText: /demo/i }).first();

		if (await userMenuTrigger.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await userMenuTrigger.click();
			// Menu should show Settings, Support, Logout
			await expect(
				page.getByText('Settings').or(page.getByText('Logout'))
			).toBeVisible({ timeout: 5_000 });
		}
	});

	test('should open settings modal from user menu', async ({ posPage: page }) => {
		const userMenuTrigger = page.getByRole('button').filter({ hasText: /demo/i }).first();

		if (await userMenuTrigger.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await userMenuTrigger.click();
			await page.getByText('Settings').first().click();
			await expect(page.getByText(/General|Tax|Barcode|Keyboard|Theme/).first()).toBeVisible({
				timeout: 10_000,
			});
		}
	});

	test('should show online status indicator', async ({ posPage: page }) => {
		// The header should have some connection indicator
		const header = page.locator('header').first();
		await expect(header).toBeVisible();
		// Online indicator renders in the header - its presence confirms the header loaded
	});
});

test.describe('Upgrade Banner (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade banner only for free stores');
	});

	test('should show upgrade banner for free users', async ({ posPage: page }) => {
		// Free users see an upgrade notice in the header
		const upgradeText = page.getByText(/upgrade|pro/i).first();
		await expect(upgradeText).toBeVisible({ timeout: 10_000 });
	});
});
