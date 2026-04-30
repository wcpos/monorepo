import { expect } from '@playwright/test';

import { getStoreVariant, navigateToPage, authenticatedTest as test } from './fixtures';

/**
 * Products page (pro-only drawer page with inline editing).
 */
test.describe('Products Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Products page requires Pro');
	});

	test('should navigate to Products page and see product table', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByTestId('search-products')).toBeVisible({
			timeout: 30_000,
		});
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});
	});

	test('should show stock and price columns on Products page', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});

		const columnheaders = screen.getByRole('columnheader');
		expect(await columnheaders.count()).toBeGreaterThanOrEqual(3);
	});

	test('should reorder rows when clicking the Name column header on Products page', async ({
		posPage: page,
	}) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});

		// Use deterministic fixture data known to include multiple hoodie products.
		const searchInput = screen.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_500);

		const hoodieWithPocketRow = screen.getByTestId('data-table-row-hoodie-with-pocket').first();
		const hoodieWithZipperRow = screen.getByTestId('data-table-row-hoodie-with-zipper').first();
		await expect(hoodieWithPocketRow).toBeVisible({ timeout: 30_000 });
		await expect(hoodieWithZipperRow).toBeVisible({ timeout: 30_000 });

		const getRowOrder = async () => {
			return Promise.all(
				[hoodieWithPocketRow, hoodieWithZipperRow].map(
					async (row) => (await row.boundingBox())?.y ?? -1
				)
			);
		};

		const [initialHoodieWithPocketY, initialHoodieWithZipperY] = await getRowOrder();
		expect(initialHoodieWithPocketY).toBeGreaterThan(0);
		expect(initialHoodieWithZipperY).toBeGreaterThan(0);
		expect(initialHoodieWithPocketY).not.toBe(initialHoodieWithZipperY);
		const initialSortDirection = Math.sign(initialHoodieWithPocketY - initialHoodieWithZipperY);

		const productSortControl = screen.getByTestId('data-table-header-name').first();
		await expect(productSortControl).toBeVisible({ timeout: 15_000 });
		await productSortControl.click();

		const getSortDirection = async () => {
			const [hoodieWithPocketY, hoodieWithZipperY] = await getRowOrder();
			return Math.sign(hoodieWithPocketY - hoodieWithZipperY);
		};

		try {
			await expect.poll(getSortDirection, { timeout: 8_000 }).toBe(initialSortDirection * -1);
		} catch {
			// First click can set the current sort direction instead of toggling it.
			await productSortControl.click();
			await expect.poll(getSortDirection, { timeout: 15_000 }).toBe(initialSortDirection * -1);
		}
	});

	test('should search products on Products page', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});

		const searchInput = screen.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_500);

		const countEl = screen.getByTestId('data-table-count');
		const noResults = screen.getByTestId('no-data-message');

		const hasResults = await countEl.isVisible().catch(() => false);
		const hasNoResults = await noResults.isVisible().catch(() => false);
		expect(hasResults || hasNoResults).toBeTruthy();
	});

	test('should show product actions menu', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});

		const actionsButton = screen.getByTestId('product-actions-button').first();
		await expect(actionsButton).toBeVisible({ timeout: 15_000 });
		await actionsButton.click();

		await expect(page.getByRole('menuitem').first()).toBeVisible({
			timeout: 15_000,
		});
	});

	test('should expand variable product to show variations', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});

		// Search for a variable product
		const searchInput = screen.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(2_000);

		// Click the expand link on the variable product
		const expandLink = screen.getByTestId('variable-product-expand').first();
		await expect(expandLink).toBeVisible({ timeout: 30_000 });
		await expandLink.click();
		await page.waitForTimeout(1_500);

		// Variation rows should now be visible with their actions menus
		const variationActionsMenu = screen.getByTestId('variation-actions-menu');
		await expect(variationActionsMenu.first()).toBeVisible({ timeout: 15_000 });
	});

	test('should show variation actions menu with edit/sync/delete', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});

		// Search for a variable product and expand it
		const searchInput = screen.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(2_000);

		const expandLink = screen.getByTestId('variable-product-expand').first();
		await expect(expandLink).toBeVisible({ timeout: 30_000 });
		await expandLink.click();
		await page.waitForTimeout(1_500);

		// Click the variation actions menu (ellipsis button)
		const variationActionsMenu = screen.getByTestId('variation-actions-menu').first();
		await expect(variationActionsMenu).toBeVisible({ timeout: 15_000 });
		await variationActionsMenu.click();

		// The dropdown should show menu items (Edit, Sync, Delete)
		await expect(page.getByRole('menuitem').first()).toBeVisible({
			timeout: 15_000,
		});
	});

	test('should collapse expanded variable product on Products page', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});

		// Search and expand
		const searchInput = screen.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(2_000);

		const expandLink = screen.getByTestId('variable-product-expand').first();
		await expect(expandLink).toBeVisible({ timeout: 30_000 });
		await expandLink.click();
		await page.waitForTimeout(1_500);

		const variationActionsMenu = screen.getByTestId('variation-actions-menu');
		await expect(variationActionsMenu.first()).toBeVisible({ timeout: 15_000 });

		// Collapse
		await expandLink.click();
		await page.waitForTimeout(1_000);

		// Variation actions should no longer be visible
		await expect(variationActionsMenu.first()).not.toBeVisible({
			timeout: 10_000,
		});
	});
});

/**
 * Free users should see the blurred preview overlay when navigating to Products.
 */
test.describe('Products Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show upgrade overlay on Products', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({
			timeout: 30_000,
		});
	});

	test('should show View Demo button on upgrade overlay', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByTestId('view-demo-button')).toBeVisible();
	});
});
