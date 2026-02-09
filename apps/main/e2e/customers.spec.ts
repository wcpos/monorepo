import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant, navigateToPage } from './fixtures';

/**
 * Customer-related tests in the POS context (both free and pro).
 */
test.describe('Customers in POS', () => {
	test('should show guest customer by default', async ({ posPage: page }) => {
		await expect(page.getByTestId('cart-customer-name')).toBeVisible();
	});

	test('should open customer address dialog when clicking customer name', async ({ posPage: page }) => {
		const customerPill = page.getByTestId('cart-customer-name');
		await expect(customerPill).toBeVisible({ timeout: 15_000 });
		await customerPill.click();

		// Should open the Edit Customer Address dialog
		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
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

	test('should have enabled add customer button', async ({ posPage: page }) => {
		const addButton = page.getByTestId('add-customer-button');
		await expect(addButton).toBeEnabled({ timeout: 10_000 });
	});

	test('should open add customer dialog from cart', async ({ posPage: page }) => {
		const addButton = page.getByTestId('add-customer-button');
		await expect(addButton).toBeEnabled({ timeout: 10_000 });
		await addButton.click();

		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
	});

	test('should show customer form fields in dialog', async ({ posPage: page }) => {
		await page.getByTestId('add-customer-button').click();
		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

		// Form should contain input fields for customer details
		const inputs = page.getByRole('dialog').locator('input');
		expect(await inputs.count()).toBeGreaterThanOrEqual(1);
	});
});

/**
 * Free: add customer button should be disabled.
 */
test.describe('Add Customer from Cart (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Only for free stores');
	});

	test('should not have add customer testId (pro-only)', async ({ posPage: page }) => {
		// Free users get a disabled icon button without the testId
		const addButton = page.getByTestId('add-customer-button');
		await expect(addButton).toHaveCount(0);
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
		await navigateToPage(page, 'customers');
		const screen = page.getByTestId('screen-customers');
		await expect(screen.getByTestId('search-customers')).toBeVisible({ timeout: 30_000 });
	});

	test('should show customer data or empty state', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		const screen = page.getByTestId('screen-customers');
		await expect(screen.getByTestId('search-customers')).toBeVisible({ timeout: 30_000 });

		const hasCustomers = await screen
			.getByTestId('data-table-count')
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		const noCustomers = await screen
			.getByTestId('no-data-message')
			.isVisible({ timeout: 15_000 })
			.catch(() => false);
		expect(hasCustomers || noCustomers).toBeTruthy();
	});

	test('should search customers', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		const screen = page.getByTestId('screen-customers');
		await expect(screen.getByTestId('search-customers')).toBeVisible({ timeout: 30_000 });

		const searchInput = screen.getByTestId('search-customers');
		await searchInput.fill('admin');
		await page.waitForTimeout(1_500);

		const countEl = screen.getByTestId('data-table-count');
		const hasResults = await countEl
			.isVisible()
			.then(async (visible) => visible && /[1-9]/.test(await countEl.textContent() ?? ''))
			.catch(() => false);
		const noResults = await screen
			.getByTestId('no-data-message')
			.isVisible()
			.catch(() => false);
		expect(hasResults || noResults).toBeTruthy();
	});

	test('should have add customer button on Customers page', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		const screen = page.getByTestId('screen-customers');
		await expect(screen.getByTestId('search-customers')).toBeVisible({ timeout: 30_000 });

		// The add customer button is an IconButton with userPlus icon next to the search
		// It doesn't have accessible text, so we find it by being a button near the search
		// The button is inside an HStack with the search input, look for buttons with role="button"
		const headerButtons = screen.locator('[role="button"]');
		const buttonCount = await headerButtons.count();

		// Should have at least 2 buttons in the header (add customer + settings)
		expect(buttonCount).toBeGreaterThanOrEqual(2);
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
		await navigateToPage(page, 'customers');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('view-demo-button')).toBeVisible();
	});
});
