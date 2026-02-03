import { expect, type Page } from '@playwright/test';
import { authenticatedTest as test, getStoreVariant, navigateToPage } from './fixtures';

/** Helper to navigate to Orders page and wait for load */
async function navigateToOrders(page: Page) {
	await navigateToPage(page, 'orders');
	const screen = page.getByTestId('screen-orders');
	await expect(screen.getByPlaceholder('Search Orders')).toBeVisible({ timeout: 30_000 });
	return screen;
}

/**
 * Orders page (pro-only).
 */
test.describe('Orders Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Orders page requires Pro');
	});

	test('should navigate to Orders page and see order list', async ({ posPage: page }) => {
		await navigateToOrders(page);
	});

	test('should show order columns', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		// Wait for orders data to load first
		await expect(
			screen.getByText(/Showing \d+ of \d+/).or(screen.getByText('No orders found')).first()
		).toBeVisible({ timeout: 30_000 });

		// Check for actual column headers (no Status header - status shown as icon)
		await expect(screen.getByRole('columnheader', { name: /Total/i })).toBeVisible({ timeout: 15_000 });
		await expect(screen.getByRole('columnheader', { name: /Customer/i })).toBeVisible({ timeout: 15_000 });
	});

	test('should show orders or empty state', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		const hasOrders = await screen
			.getByText(/Showing \d+ of \d+/)
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		const noOrders = await screen
			.getByText('No orders found')
			.isVisible({ timeout: 15_000 })
			.catch(() => false);
		expect(hasOrders || noOrders).toBeTruthy();
	});

	test('should search orders', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		const searchInput = screen.getByPlaceholder('Search Orders');
		await searchInput.fill('123');
		await page.waitForTimeout(1_500);

		const hasResults = await screen
			.getByText(/Showing \d+ of \d+/)
			.isVisible()
			.catch(() => false);
		const noResults = await screen
			.getByText('No orders found')
			.isVisible()
			.catch(() => false);
		expect(hasResults || noResults).toBeTruthy();
	});

	test('should show filter pills', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		await expect(screen.getByText('Status').first()).toBeVisible({ timeout: 15_000 });
	});

	test('should show order actions menu', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		const hasOrders = await screen
			.getByText(/Showing [1-9]\d* of \d+/)
			.isVisible({ timeout: 15_000 })
			.catch(() => false);

		if (!hasOrders) {
			test.skip(true, 'No orders available to test actions menu');
		}

		// Find the first data row in the table body
		const dataRow = screen.locator('[role="rowgroup"] [role="row"]').first();
		await expect(dataRow).toBeVisible({ timeout: 15_000 });

		// The ellipsis button is the last pressable element in the row
		const rowButtons = dataRow.locator('[role="button"]');
		const count = await rowButtons.count();

		// Click the last button (the ellipsis/actions button)
		if (count > 0) {
			await rowButtons.nth(count - 1).click();
		}

		// Menu should show Edit option
		await expect(page.getByText('Edit').first()).toBeVisible({ timeout: 15_000 });
	});
});

/**
 * Free users should see upgrade page.
 */
test.describe('Orders Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show upgrade page on Orders', async ({ posPage: page }) => {
		await navigateToPage(page, 'orders');
		await expect(page.getByText('Upgrade to Pro', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button', async ({ posPage: page }) => {
		await navigateToPage(page, 'orders');
		await expect(page.getByText('Upgrade to Pro', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('button', { name: 'View Demo' })).toBeVisible();
	});
});
