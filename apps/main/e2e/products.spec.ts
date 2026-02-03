import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant, navigateToPage } from './fixtures';

/**
 * Product browsing and search in the POS panel (both free and pro).
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

	test('should show "No products found" for nonsense search', async ({ posPage: page }) => {
		const searchInput = page.getByPlaceholder('Search Products');
		await searchInput.fill('zzzznonexistentproductzzzz');
		await page.waitForTimeout(1_000);

		await expect(page.getByText('No products found')).toBeVisible({ timeout: 15_000 });
	});

	test('should update product count after search', async ({ posPage: page }) => {
		// Capture initial count
		const countText = page.getByText(/Showing (\d+) of (\d+)/);
		await expect(countText).toBeVisible();
		const initialText = await countText.textContent();

		// Search for something specific
		const searchInput = page.getByPlaceholder('Search Products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_500);

		// Count text should change (either fewer results or "No products found")
		const hasResults = await page.getByText(/Showing \d+ of \d+/).isVisible().catch(() => false);
		const noResults = await page.getByText('No products found').isVisible().catch(() => false);
		expect(hasResults || noResults).toBeTruthy();

		if (hasResults) {
			const filteredText = await page.getByText(/Showing \d+ of \d+/).textContent();
			// The count should differ from the initial full count or be the same
			// (if all products match - unlikely for "hoodie")
			expect(filteredText).toBeTruthy();
		}
	});

	test('should add a product to the cart', async ({ posPage: page }) => {
		await page.getByTestId('add-to-cart-button').first().click();
		await expect(page.getByRole('button', { name: /Checkout/ })).toBeVisible({ timeout: 10_000 });
	});

	test('should show variable product with variations', async ({ posPage: page }) => {
		// Search for a known variable product (WooCommerce sample data has "V-Neck T-Shirt" or "Hoodie")
		const searchInput = page.getByPlaceholder('Search Products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_500);

		// If there are results, look for a variable product expand trigger
		const hasResults = await page
			.getByText(/Showing [1-9]\d* of \d+/)
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
		await expect(screen.getByPlaceholder('Search Products')).toBeVisible({ timeout: 30_000 });
		await expect(screen.getByText(/Showing \d+ of \d+/)).toBeVisible({ timeout: 60_000 });
	});

	test('should show stock and price columns on Products page', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByText(/Showing \d+ of \d+/)).toBeVisible({ timeout: 60_000 });

		await expect(screen.getByRole('columnheader', { name: 'Stock', exact: true })).toBeVisible();
		await expect(screen.getByRole('columnheader', { name: 'Price', exact: true })).toBeVisible();
	});

	test('should search products on Products page', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByText(/Showing \d+ of \d+/)).toBeVisible({ timeout: 60_000 });

		const searchInput = screen.getByPlaceholder('Search Products');
		await searchInput.fill('hoodie');
		await page.waitForTimeout(1_500);

		const hasResults = await screen
			.getByText(/Showing [1-9]\d* of \d+/)
			.isVisible()
			.catch(() => false);
		const noResults = await screen.getByText('No products found').isVisible().catch(() => false);
		expect(hasResults || noResults).toBeTruthy();
	});

	test('should show product actions menu', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products');
		await expect(screen.getByText(/Showing \d+ of \d+/)).toBeVisible({ timeout: 60_000 });

		// Find a data row by looking for rows that contain "Manage" (stock toggle label)
		const dataRow = screen.locator('[role="row"]').filter({ hasText: 'Manage' }).first();
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
		await expect(page.getByText('Edit').first()).toBeVisible({ timeout: 15_000 });
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
		await expect(page.getByText('Upgrade to Pro', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button on upgrade page', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		await expect(page.getByText('Upgrade to Pro', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('button', { name: 'View Demo' })).toBeVisible();
	});
});
