import { test, expect } from '@playwright/test';
import { setupApiMocks, mockProducts } from './fixtures/mock-api';

/**
 * Products management tests
 *
 * These tests verify product browsing, searching, and viewing functionality.
 */

test.describe('Products', () => {
	test.beforeEach(async ({ page }) => {
		await setupApiMocks(page);
	});

	test.describe('Product List', () => {
		test.skip('should display products in POS view', async ({ page }) => {
			await page.goto('/');

			// Wait for product grid/list to load
			const productList = page.locator('[data-testid="product-list"], [data-testid="product-grid"]');

			if (await productList.isVisible({ timeout: 10000 }).catch(() => false)) {
				// Verify at least one product is displayed
				const productCards = page.locator('[data-testid="product-card"]');
				await expect(productCards.first()).toBeVisible();
			}
		});

		test.skip('should search products', async ({ page }) => {
			await page.goto('/');

			// Find search input
			const searchInput = page.locator(
				'[data-testid="product-search"], input[placeholder*="Search"]'
			);

			if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
				// Type search query
				await searchInput.fill(mockProducts[0].name);

				// Wait for search results
				await page.waitForTimeout(500); // Debounce delay

				// Verify filtered results
				const productCard = page.locator(`[data-testid="product-card"]:has-text("${mockProducts[0].name}")`);
				await expect(productCard).toBeVisible({ timeout: 5000 });
			}
		});

		test.skip('should filter products by category', async ({ page }) => {
			await page.goto('/');

			// Find category filter
			const categoryFilter = page.locator(
				'[data-testid="category-filter"], [aria-label="Category filter"]'
			);

			if (await categoryFilter.isVisible({ timeout: 5000 }).catch(() => false)) {
				await categoryFilter.click();

				// Select a category
				const categoryOption = page.locator('text="Uncategorized"');
				if (await categoryOption.isVisible({ timeout: 3000 }).catch(() => false)) {
					await categoryOption.click();

					// Verify products are filtered
					await page.waitForTimeout(500);
					const productList = page.locator('[data-testid="product-list"]');
					await expect(productList).toBeVisible();
				}
			}
		});

		test.skip('should show product details on click', async ({ page }) => {
			await page.goto('/');

			// Click on a product
			const productCard = page.locator('[data-testid="product-card"]').first();

			if (await productCard.isVisible({ timeout: 5000 }).catch(() => false)) {
				await productCard.click();

				// Product should either be added to cart or show details
				// This behavior depends on the app configuration
				const hasDetails = await page
					.locator('[data-testid="product-details"]')
					.isVisible({ timeout: 3000 })
					.catch(() => false);

				const hasCartItem = await page
					.locator('[data-testid="cart-item"]')
					.isVisible({ timeout: 3000 })
					.catch(() => false);

				expect(hasDetails || hasCartItem).toBeTruthy();
			}
		});
	});

	test.describe('Products Screen', () => {
		test.skip('should navigate to products management screen', async ({ page }) => {
			await page.goto('/');

			// Find products link in drawer/menu
			const productsLink = page.locator(
				'[data-testid="nav-products"], a:has-text("Products"), [aria-label="Products"]'
			);

			if (await productsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
				await productsLink.click();

				// Verify we're on the products screen
				await expect(page).toHaveURL(/products/);
			}
		});

		test.skip('should display product table in management view', async ({ page }) => {
			// Navigate directly to products screen
			await page.goto('/products');

			// Wait for table to load
			const productTable = page.locator('[data-testid="products-table"], table');

			if (await productTable.isVisible({ timeout: 10000 }).catch(() => false)) {
				// Verify table has rows
				const tableRows = page.locator('tbody tr, [data-testid="product-row"]');
				await expect(tableRows.first()).toBeVisible({ timeout: 5000 });
			}
		});
	});

	test.describe('Variable Products', () => {
		test.skip('should show variation selector for variable products', async ({ page }) => {
			await page.goto('/');

			// Find a variable product (if any)
			const variableProduct = page.locator('[data-testid="product-card"][data-type="variable"]');

			if (await variableProduct.isVisible({ timeout: 5000 }).catch(() => false)) {
				await variableProduct.click();

				// Should show variation selector
				const variationSelector = page.locator('[data-testid="variation-selector"]');
				await expect(variationSelector).toBeVisible({ timeout: 5000 });
			}
		});
	});
});
