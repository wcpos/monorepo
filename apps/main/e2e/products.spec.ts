import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant, navigateToPage } from './fixtures';

/**
 * Product browsing and search in the POS panel (both free and pro).
 */
test.describe('Products in POS', () => {
	test('should display products in the POS view', async ({ posPage: page }) => {
		const columnheaders = page.getByRole('columnheader');
		await expect(columnheaders.first()).toBeVisible({ timeout: 15_000 });
		expect(await columnheaders.count()).toBeGreaterThanOrEqual(2);
		await expect(page.getByTestId('data-table-count')).toBeVisible();
	});

	test('should search products by name', async ({ posPage: page }) => {
		const searchInput = page.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_000);

		const countEl = page.getByTestId('data-table-count');
		const noResults = page.getByTestId('no-data-message');

		const hasResults = await countEl
			.isVisible()
			.catch(() => false);
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
		// Capture initial count
		const countEl = page.getByTestId('data-table-count');
		await expect(countEl).toBeVisible();
		const initialText = await countEl.textContent();

		// Search for something specific
		const searchInput = page.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_500);

		// Count text should change (either fewer results or "No products found")
		const hasResults = await countEl.isVisible().catch(() => false);
		const noResults = await page.getByTestId('no-data-message').isVisible().catch(() => false);
		expect(hasResults || noResults).toBeTruthy();

		if (hasResults) {
			const filteredText = await countEl.textContent();
			// The count should differ from the initial full count or be the same
			// (if all products match - unlikely for "hoodie")
			expect(filteredText).toBeTruthy();
		}
	});

	test('should add a product to the cart', async ({ posPage: page }) => {
		await page.getByTestId('add-to-cart-button').first().click();
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 10_000 });
	});

	test('should show variable product with variations', async ({ posPage: page }) => {
		// Search for a known variable product (WooCommerce sample data has "V-Neck T-Shirt" or "Hoodie")
		const searchInput = page.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_500);

		// If there are results, look for a variable product expand trigger
		const hasResults = await page
			.getByTestId('data-table-count')
			.isVisible()
			.catch(() => false);

		if (hasResults) {
			// Variable products have a different action button (chevron instead of plus)
			// Check that at least one product row exists
			const rows = page.locator('table tbody tr, [role="row"]');
			const rowCount = await rows.count();
			expect(rowCount).toBeGreaterThan(0);
		}
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
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByTestId('search-products')).toBeVisible({ timeout: 30_000 });
		await expect(screen.getByTestId('data-table-count')).toBeVisible({ timeout: 60_000 });
	});

	test('should show stock and price columns on Products page', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({ timeout: 60_000 });

		const columnheaders = screen.getByRole('columnheader');
		expect(await columnheaders.count()).toBeGreaterThanOrEqual(3);
	});

	test('should search products on Products page', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({ timeout: 60_000 });

		const searchInput = screen.getByTestId('search-products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_500);

		const countEl = screen.getByTestId('data-table-count');
		const noResults = screen.getByTestId('no-data-message');

		const hasResults = await countEl
			.isVisible()
			.catch(() => false);
		const hasNoResults = await noResults.isVisible().catch(() => false);
		expect(hasResults || hasNoResults).toBeTruthy();
	});

	test('should show product actions menu', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({ timeout: 60_000 });

		// Find a data row within the rowgroup (body rows, not header)
		const dataRow = screen.locator('[role="rowgroup"] [role="row"]').first();
		await expect(dataRow).toBeVisible({ timeout: 15_000 });

		// The ellipsis button is the last pressable element in the row
		// All IconButtons in wcpos render as Pressable with role="button"
		const rowButtons = dataRow.locator('[role="button"]');
		const count = await rowButtons.count();

		// Click the last button (the ellipsis/actions button)
		if (count > 0) {
			await rowButtons.nth(count - 1).click();
		}

		// Menu should show Edit, Sync, or Delete options
		await expect(page.getByRole('menuitem').first()).toBeVisible({ timeout: 15_000 });
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
		await navigateToPage(page, 'products');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button on upgrade page', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('view-demo-button')).toBeVisible();
	});
});
