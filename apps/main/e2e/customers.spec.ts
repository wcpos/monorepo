import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant } from './fixtures';

/**
 * Customer-related tests in the POS context (both free and pro).
 */
test.describe('Customers in POS', () => {
	test('should show Guest as default customer', async ({ posPage: page }) => {
		await expect(page.getByText('Guest')).toBeVisible();
	});

	test('should have an add customer button', async ({ posPage: page }) => {
		await expect(page.getByTestId('add-customer-button')).toBeVisible({ timeout: 10_000 });
	});
});

/**
 * Pro: create a new customer from the POS cart.
 */
test.describe('Add Customer from Cart (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Adding customers from cart requires Pro');
	});

	test('should open add customer dialog from cart', async ({ posPage: page }) => {
		const addButton = page.getByTestId('add-customer-button');
		await expect(addButton).toBeEnabled({ timeout: 10_000 });
		await addButton.click();

		await expect(page.getByText('Add new customer')).toBeVisible({ timeout: 10_000 });
	});
});

/**
 * Customers page (pro-only drawer page).
 */
test.describe('Customers Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Customers page requires Pro');
	});

	test('should navigate to Customers page and see customer list', async ({ posPage: page }) => {
		await page.getByText('Customers', { exact: true }).click();
		await expect(page.getByPlaceholder('Search Customers')).toBeVisible({ timeout: 30_000 });
	});
});

/**
 * Free users should see upgrade page.
 */
test.describe('Customers Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show upgrade page on Customers', async ({ posPage: page }) => {
		await page.getByText('Customers', { exact: true }).click();
		await expect(page.getByText('Upgrade to Pro')).toBeVisible({ timeout: 30_000 });
	});
});
