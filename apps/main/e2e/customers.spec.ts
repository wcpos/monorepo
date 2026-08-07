import { expect, type Page } from '@playwright/test';

import {
	getStoreUrl,
	getStoreVariant,
	navigateToPage,
	authenticatedTest as test,
} from './fixtures';
import { createSearchProbe, deleteSearchProbe, searchAndWaitForServer } from './search-probe';

async function openAddCartItemsMenu(page: Page) {
	const menuButton = page.getByTestId('add-cart-item-menu');
	await expect(menuButton).toBeVisible({ timeout: 15_000 });
	await menuButton.click();
}

/**
 * Customer-related tests in the POS context (both free and pro).
 */
test.describe('Customers in POS', () => {
	test('should show guest customer by default', async ({ posPage: page }) => {
		await expect(page.getByTestId('cart-customer-name')).toBeVisible();
	});

	test('should open customer address dialog when clicking customer name', async ({
		posPage: page,
	}) => {
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
		await openAddCartItemsMenu(page);
		const addCustomerMenuItem = page.getByTestId('menu-add-customer');
		await expect(addCustomerMenuItem).toBeVisible({ timeout: 10_000 });
		await expect(addCustomerMenuItem).toBeEnabled();
	});

	test('should open add customer dialog from cart', async ({ posPage: page }) => {
		await openAddCartItemsMenu(page);
		const addCustomerMenuItem = page.getByTestId('menu-add-customer');
		await expect(addCustomerMenuItem).toBeEnabled({ timeout: 10_000 });
		await addCustomerMenuItem.click();

		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
	});

	test('should show customer form fields in dialog', async ({ posPage: page }) => {
		await openAddCartItemsMenu(page);
		const addCustomerMenuItem = page.getByTestId('menu-add-customer');
		await expect(addCustomerMenuItem).toBeVisible({ timeout: 10_000 });
		await expect(addCustomerMenuItem).toBeEnabled();
		await addCustomerMenuItem.click();
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

	test('should show add-customer menu item disabled for free users', async ({ posPage: page }) => {
		await openAddCartItemsMenu(page);
		const addCustomerMenuItem = page.getByTestId('menu-add-customer');
		await expect(addCustomerMenuItem).toBeVisible({ timeout: 10_000 });
		await expect(addCustomerMenuItem).toBeDisabled();
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

		await expect
			.poll(
				async () => {
					const hasCustomers = await screen
						.getByTestId('data-table-count')
						.isVisible()
						.catch(() => false);
					const noCustomers = await screen
						.getByTestId('no-data-message')
						.isVisible()
						.catch(() => false);
					return hasCustomers || noCustomers;
				},
				{ timeout: 30_000 }
			)
			.toBeTruthy();
	});

	test('should search customers', async ({
		posPage: page,
		request,
		storeAuthorization,
	}, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const authorization = storeAuthorization();
		const created = await createSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'customers',
			workerIndex: testInfo.workerIndex,
		});
		if (!created.ok) {
			test.skip(true, created.reason);
			return;
		}

		try {
			await navigateToPage(page, 'customers');
			const screen = page.getByTestId('screen-customers');
			const searchInput = screen.getByTestId('search-customers');
			await expect(searchInput).toBeVisible({ timeout: 30_000 });

			await searchAndWaitForServer(page, searchInput, 'customers', created.probe.token);

			const matchingRows = screen.getByTestId(/^data-table-row-/);
			await expect(matchingRows).toHaveCount(1, { timeout: 30_000 });
			await expect(matchingRows.first()).toBeVisible();
			await expect(screen.getByTestId('data-table-count')).toContainText(/\b1\b/);
		} finally {
			await deleteSearchProbe({
				request,
				storeUrl,
				authorization,
				collection: created.probe.collection,
				id: created.probe.id,
			});
		}
	});

	test('should have add customer button on Customers page', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		const screen = page.getByTestId('screen-customers');
		await expect(screen.getByTestId('search-customers')).toBeVisible({ timeout: 30_000 });

		await expect(screen.getByTestId('customers-add-button')).toBeVisible();
	});
});

/**
 * Free users should see the blurred preview overlay when navigating to Customers.
 */
test.describe('Customers Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show upgrade overlay on Customers', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button on upgrade overlay', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('view-demo-button')).toBeVisible();
	});
});
