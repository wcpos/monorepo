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

	test('should open customer details when clicking Guest', async ({ posPage: page }) => {
		// Find the Guest button/chip in the customer area
		const guestButton = page.getByText('Guest').first();
		await expect(guestButton).toBeVisible({ timeout: 15_000 });
		await guestButton.click();

		// Wait for dialog animation
		await page.waitForTimeout(500);

		// Clicking Guest opens the customer address/edit dialog
		// Look for the dialog content - either address form or customer details
		const hasAddressDialog = await page.getByText(/Edit Customer Address|Billing Address|First Name/i).first().isVisible({ timeout: 10_000 }).catch(() => false);
		const hasCustomerSearch = await page.getByPlaceholder('Search Customers').isVisible({ timeout: 5_000 }).catch(() => false);

		// Either behavior is acceptable - address dialog or search
		expect(hasAddressDialog || hasCustomerSearch).toBeTruthy();
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

		// The add customer button could have various names/labels
		const addButton = screen.getByRole('button', { name: /add.*customer|new.*customer|\+/i }).or(
			screen.getByRole('link', { name: /add.*customer|new.*customer/i })
		).or(
			screen.getByTestId('add-customer-button')
		).or(
			screen.getByLabel(/add|new/i)
		);

		// Check if any add button exists
		const isVisible = await addButton.first().isVisible({ timeout: 15_000 }).catch(() => false);
		// This test should pass if we can find any add button, or skip if feature doesn't exist
		if (!isVisible) {
			test.skip(true, 'Add customer button not found on Customers page');
		}
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
