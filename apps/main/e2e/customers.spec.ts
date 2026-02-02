import { expect } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

/**
 * Customer-related tests in the POS context.
 * Uses the authenticatedTest fixture which handles OAuth login.
 */
test.describe('Customers in POS', () => {
	test('should show Guest as default customer', async ({ posPage: page }) => {
		await expect(page.getByText('Guest')).toBeVisible();
	});

	test('should have an add customer button', async ({ posPage: page }) => {
		await expect(page.getByTestId('add-customer-button')).toBeVisible();
	});
});
