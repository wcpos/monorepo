import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant } from './fixtures';

/**
 * Product browsing and search tests (both free and pro).
 */
test.describe('Products in POS', () => {
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
		await page.getByTestId('add-to-cart-button').first().click();
		await expect(page.getByRole('button', { name: /Checkout/ })).toBeVisible({ timeout: 10_000 });
	});
});

/**
 * Products page (pro-only drawer page with inline editing).
 */
test.describe('Products Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Products page requires Pro');
	});

	test('should navigate to Products page and see product table', async ({ posPage: page }) => {
		await page.getByText('Products', { exact: true }).click();
		await expect(page.getByPlaceholder('Search Products')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible({ timeout: 60_000 });
	});

	test('should show stock and price columns on Products page', async ({ posPage: page }) => {
		await page.getByText('Products', { exact: true }).click();
		await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible({ timeout: 60_000 });

		await expect(page.getByRole('columnheader', { name: 'Stock' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'Price' })).toBeVisible();
	});
});

/**
 * Free users should see the upgrade page when navigating to Products.
 */
test.describe('Products Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show upgrade page on Products', async ({ posPage: page }) => {
		await page.getByText('Products', { exact: true }).click();
		await expect(page.getByText('Upgrade to Pro')).toBeVisible({ timeout: 30_000 });
	});
});
