import { expect } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant, navigateToPage } from './fixtures';

/**
 * Customer-related tests in the POS context (both free and pro).
 */
test.describe('Customers in POS', () => {
	test('should show Guest as default customer', async ({ posPage: page }) => {
		await expect(page.getByText('Guest')).toBeVisible();
	});

	test('should show customer area with Guest label', async ({ posPage: page }) => {
		await expect(page.getByText('Customer')).toBeVisible({ timeout: 10_000 });
	});

	test('should open customer address dialog when clicking Guest', async ({ posPage: page }) => {
		// Find and click the Guest button/chip - this opens the address editor
		const guestButton = page.getByText('Guest').first();
		await expect(guestButton).toBeVisible({ timeout: 15_000 });
		await guestButton.click();

		// Should open the Edit Customer Address dialog
		await expect(page.getByText('Edit Customer Address')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText('Billing Address')).toBeVisible({ timeout: 10_000 });
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

		await expect(page.getByText('Add new customer')).toBeVisible({ timeout: 10_000 });
	});

	test('should show customer form fields in dialog', async ({ posPage: page }) => {
		await page.getByTestId('add-customer-button').click();
		await expect(page.getByText('Add new customer')).toBeVisible({ timeout: 10_000 });

		// Form should contain name/email fields
		await expect(
			page.getByText(/first name|last name|email/i).first()
		).toBeVisible({ timeout: 15_000 });
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
		await expect(screen.getByPlaceholder('Search Customers')).toBeVisible({ timeout: 30_000 });
	});

	test('should show customer data or empty state', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		const screen = page.getByTestId('screen-customers');
		await expect(screen.getByPlaceholder('Search Customers')).toBeVisible({ timeout: 30_000 });

		const hasCustomers = await screen
			.getByText(/Showing \d+ of \d+/)
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		const noCustomers = await screen
			.getByText('No customers found')
			.isVisible({ timeout: 15_000 })
			.catch(() => false);
		expect(hasCustomers || noCustomers).toBeTruthy();
	});

	test('should search customers', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		const screen = page.getByTestId('screen-customers');
		await expect(screen.getByPlaceholder('Search Customers')).toBeVisible({ timeout: 30_000 });

		const searchInput = screen.getByPlaceholder('Search Customers');
		await searchInput.fill('admin');
		await page.waitForTimeout(1_500);

		const hasResults = await screen
			.getByText(/Showing [1-9]\d* of \d+/)
			.isVisible()
			.catch(() => false);
		const noResults = await screen
			.getByText('No customers found')
			.isVisible()
			.catch(() => false);
		expect(hasResults || noResults).toBeTruthy();
	});

	test('should have add customer button on Customers page', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		const screen = page.getByTestId('screen-customers');
		await expect(screen.getByPlaceholder('Search Customers')).toBeVisible({ timeout: 30_000 });

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
		await expect(page.getByText('Upgrade to Pro', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		await expect(page.getByText('Upgrade to Pro', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('button', { name: 'View Demo' })).toBeVisible();
	});
});
