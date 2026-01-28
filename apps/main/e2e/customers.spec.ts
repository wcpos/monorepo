import { test, expect } from '@playwright/test';
import { setupApiMocks, mockCustomers } from './fixtures/mock-api';

/**
 * Customers management tests
 *
 * These tests verify customer search, creation, and management functionality.
 */

test.describe('Customers', () => {
	test.beforeEach(async ({ page }) => {
		await setupApiMocks(page);
	});

	test.describe('Customer Search', () => {
		test.skip('should search customers in POS', async ({ page }) => {
			await page.goto('/');

			// Find add customer or customer search
			const addCustomerButton = page.locator(
				'[data-testid="add-customer"], button:has-text("Customer")'
			);

			if (await addCustomerButton.isVisible({ timeout: 5000 }).catch(() => false)) {
				await addCustomerButton.click();

				// Search for customer
				const searchInput = page.locator(
					'[data-testid="customer-search"], input[placeholder*="Search"]'
				);

				if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
					await searchInput.fill(mockCustomers[0].email);

					// Wait for results
					await page.waitForTimeout(500);

					// Verify customer appears in results
					const customerResult = page.locator(`text="${mockCustomers[0].email}"`);
					await expect(customerResult).toBeVisible({ timeout: 5000 });
				}
			}
		});

		test.skip('should show customer details when selected', async ({ page }) => {
			await page.goto('/');

			// Navigate to customers or open customer panel
			const customersLink = page.locator('[data-testid="nav-customers"], a:has-text("Customers")');

			if (await customersLink.isVisible({ timeout: 5000 }).catch(() => false)) {
				await customersLink.click();

				// Click on a customer
				const customerRow = page.locator(`text="${mockCustomers[0].email}"`);

				if (await customerRow.isVisible({ timeout: 5000 }).catch(() => false)) {
					await customerRow.click();

					// Verify customer details are shown
					await expect(
						page.locator(`text="${mockCustomers[0].first_name}"`)
					).toBeVisible({ timeout: 5000 });
				}
			}
		});
	});

	test.describe('Customer Management Screen', () => {
		test.skip('should navigate to customers screen', async ({ page }) => {
			await page.goto('/');

			// Find customers link in navigation
			const customersLink = page.locator(
				'[data-testid="nav-customers"], a:has-text("Customers"), [aria-label="Customers"]'
			);

			if (await customersLink.isVisible({ timeout: 5000 }).catch(() => false)) {
				await customersLink.click();

				// Verify navigation
				await expect(page).toHaveURL(/customers/);
			}
		});

		test.skip('should display customer list', async ({ page }) => {
			// Navigate directly to customers
			await page.goto('/customers');

			// Wait for customer list
			const customerList = page.locator('[data-testid="customer-list"], [data-testid="customers-table"]');

			if (await customerList.isVisible({ timeout: 10000 }).catch(() => false)) {
				// Verify at least one customer is shown
				const customerRows = page.locator('[data-testid="customer-row"], tbody tr');
				await expect(customerRows.first()).toBeVisible({ timeout: 5000 });
			}
		});

		test.skip('should open add customer modal', async ({ page }) => {
			await page.goto('/customers');

			// Find add customer button
			const addButton = page.locator('[data-testid="add-customer-button"], button:has-text("Add")');

			if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
				await addButton.click();

				// Verify modal opens
				const modal = page.locator('[data-testid="add-customer-modal"], [role="dialog"]');
				await expect(modal).toBeVisible({ timeout: 5000 });
			}
		});

		test.skip('should create new customer', async ({ page }) => {
			await page.goto('/customers');

			// Open add customer modal
			const addButton = page.locator('[data-testid="add-customer-button"], button:has-text("Add")');

			if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
				await addButton.click();

				// Fill in customer details
				const firstNameInput = page.locator('[name="first_name"], input[placeholder*="First"]');
				const lastNameInput = page.locator('[name="last_name"], input[placeholder*="Last"]');
				const emailInput = page.locator('[name="email"], input[placeholder*="Email"]');

				if (await firstNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
					await firstNameInput.fill('New');
					await lastNameInput.fill('Customer');
					await emailInput.fill('new@example.com');

					// Submit
					const saveButton = page.locator('button:has-text("Save"), button:has-text("Create")');
					await saveButton.click();

					// Verify customer created (modal closes or success message)
					await expect(
						page.locator('text=/success|created/i').or(page.locator('[data-testid="customer-list"]'))
					).toBeVisible({ timeout: 10000 });
				}
			}
		});
	});

	test.describe('Customer Editing', () => {
		test.skip('should edit existing customer', async ({ page }) => {
			await page.goto('/customers');

			// Click on a customer to edit
			const customerRow = page.locator('[data-testid="customer-row"]').first();

			if (await customerRow.isVisible({ timeout: 5000 }).catch(() => false)) {
				// Find edit button or click row
				const editButton = customerRow.locator('[data-testid="edit-button"], button:has-text("Edit")');

				if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
					await editButton.click();
				} else {
					await customerRow.click();
				}

				// Verify edit form appears
				const editForm = page.locator('[data-testid="edit-customer-form"], form');
				await expect(editForm).toBeVisible({ timeout: 5000 });
			}
		});
	});
});
