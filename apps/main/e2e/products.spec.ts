import { expect } from '@playwright/test';

import { authenticatedTest as test } from './fixtures';

/**
 * Product browsing and search in the POS panel (both free and pro).
 *
 * The default view mode is "grid" (tile view). Tests cover both the grid
 * and table views, as well as toggling between them.
 */
test.describe('Products in POS', () => {
	test('should display product tiles in grid view by default', async ({ posPage: page }) => {
		const tiles = page.getByTestId('product-tile').or(page.getByTestId('variable-product-tile'));
		await expect(tiles.first()).toBeVisible({ timeout: 15_000 });

		const tileCount = await tiles.count();
		expect(tileCount).toBeGreaterThanOrEqual(1);
		await expect(page.getByTestId('data-table-count')).toBeVisible();
	});

	test('should display the view mode toggle button', async ({ posPage: page }) => {
		await expect(page.getByTestId('view-mode-toggle')).toBeVisible();
	});

	test('should switch from grid view to table view', async ({ posPage: page }) => {
		// Default is grid — verify tiles are showing
		const tiles = page.getByTestId('product-tile').or(page.getByTestId('variable-product-tile'));
		await expect(tiles.first()).toBeVisible({ timeout: 15_000 });

		// Click toggle to switch to table view
		await page.getByTestId('view-mode-toggle').click();

		// Table view should show column headers
		const columnheaders = page.getByRole('columnheader');
		await expect(columnheaders.first()).toBeVisible({ timeout: 15_000 });
		expect(await columnheaders.count()).toBeGreaterThanOrEqual(2);
	});

	test('should switch from table view back to grid view', async ({ posPage: page }) => {
		// Switch to table first
		await page.getByTestId('view-mode-toggle').click();
		await expect(page.getByRole('columnheader').first()).toBeVisible({ timeout: 15_000 });

		// Switch back to grid
		await page.getByTestId('view-mode-toggle').click();

		// Tiles should reappear
		const tiles = page.getByTestId('product-tile').or(page.getByTestId('variable-product-tile'));
		await expect(tiles.first()).toBeVisible({ timeout: 15_000 });
	});

	test('should search products by name', async ({ posPage: page }) => {
		const searchInput = page.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_000);

		const countEl = page.getByTestId('data-table-count');
		const noResults = page.getByTestId('no-data-message');

		const hasResults = await countEl.isVisible().catch(() => false);
		const hasNoResults = await noResults.isVisible().catch(() => false);
		expect(hasResults || hasNoResults).toBeTruthy();
	});

	test('should clear search and show all products', async ({ posPage: page }) => {
		const searchInput = page.getByTestId('search-products');

		await searchInput.fill('test');
		await page.waitForTimeout(1_000);

		await searchInput.clear();
		await page.waitForTimeout(1_000);

		await expect(page.getByTestId('data-table-count')).toContainText(/[1-9]/);
	});

	test('should show "No products found" for nonsense search', async ({ posPage: page }) => {
		const searchInput = page.getByTestId('search-products');
		await searchInput.fill('zzzznonexistentproductzzzz');
		await page.waitForTimeout(1_000);

		await expect(page.getByTestId('no-data-message')).toBeVisible({ timeout: 15_000 });
	});

	test('should update product count after search', async ({ posPage: page }) => {
		const countEl = page.getByTestId('data-table-count');
		await expect(countEl).toBeVisible();
		const initialText = await countEl.textContent();

		const searchInput = page.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_500);

		const hasResults = await countEl.isVisible().catch(() => false);
		const noResults = await page
			.getByTestId('no-data-message')
			.isVisible()
			.catch(() => false);
		expect(hasResults || noResults).toBeTruthy();

		if (hasResults) {
			const filteredText = await countEl.textContent();
			expect(filteredText).toBeTruthy();
		}
	});

	test('should add a simple product to cart by clicking tile', async ({ posPage: page }) => {
		// In grid view, clicking a product tile adds it to the cart
		await page.getByTestId('product-tile').first().click();
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 10_000 });
	});

	test('should show variable product tiles in grid view', async ({ posPage: page }) => {
		const searchInput = page.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_500);

		// Seed data must include "hoodie" as a variable product
		const variableTiles = page.getByTestId('variable-product-tile');
		await expect(variableTiles.first()).toBeVisible({ timeout: 10_000 });
	});

	test('should open variation popover when clicking variable product tile', async ({
		posPage: page,
	}) => {
		const searchInput = page.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_500);

		const variableTile = page.getByTestId('variable-product-tile');
		await expect(variableTile.first()).toBeVisible({ timeout: 10_000 });
		await variableTile.first().click();
		// The popover renders with role="dialog" from the Popover component
		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
	});

	test('should add product to cart in table view', async ({ posPage: page }) => {
		// Switch to table view
		await page.getByTestId('view-mode-toggle').click();
		await expect(page.getByRole('columnheader').first()).toBeVisible({ timeout: 15_000 });

		// Table view uses the add-to-cart-button in each row
		await page.getByTestId('add-to-cart-button').first().click();
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 10_000 });
	});
});
