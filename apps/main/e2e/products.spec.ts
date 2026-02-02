import { expect } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

/**
 * Product browsing and search tests.
 * Uses the authenticatedTest fixture which handles OAuth login.
 */
test.describe('Products', () => {
	test('should display products in the POS view', async ({ posPage: page }) => {
		await expect(page.getByRole('columnheader', { name: 'Product' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'Price' })).toBeVisible();
		await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible();
	});

	test('should search products by name', async ({ posPage: page }) => {
		const searchInput = page.getByPlaceholder('Search Products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_000);

		const hasResults = await page
			.getByText(/Showing [1-9]\d* of \d+/)
			.isVisible()
			.catch(() => false);
		const noResults = await page.getByText('No products found').isVisible().catch(() => false);
		expect(hasResults || noResults).toBeTruthy();
	});

	test('should clear search and show all products', async ({ posPage: page }) => {
		const searchInput = page.getByPlaceholder('Search Products');

		await searchInput.fill('test');
		await page.waitForTimeout(1_000);

		await searchInput.clear();
		await page.waitForTimeout(1_000);

		await expect(page.getByText(/Showing [1-9]\d* of \d+/)).toBeVisible();
	});

	test('should add a product to the cart', async ({ posPage: page }) => {
		// Click the action button (last button) in the first product row
		const firstRow = page.getByRole('row').filter({ hasText: /\d+[,.]?\d*\s*\$/ }).first();
		const addButton = firstRow.getByRole('button').last();
		await addButton.click();

		await expect(page.getByRole('button', { name: /Checkout/ })).toBeVisible({ timeout: 10_000 });
	});
});
