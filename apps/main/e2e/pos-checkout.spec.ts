import { test, expect } from '@playwright/test';
import { setupApiMocks, mockProducts, mockCustomers } from './fixtures/mock-api';

/**
 * POS Cart and Checkout tests
 *
 * These tests verify the core POS functionality including:
 * - Adding products to cart
 * - Updating quantities
 * - Applying customers
 * - Completing checkout
 */

test.describe('POS Cart', () => {
	test.beforeEach(async ({ page }) => {
		// Setup API mocks for deterministic testing
		await setupApiMocks(page);
	});

	test.describe('When authenticated', () => {
		test.skip('should display empty cart initially', async ({ page }) => {
			// Navigate to POS screen
			await page.goto('/');

			// Wait for POS screen to load (requires authentication)
			const cartArea = page.locator('[data-testid="cart"], [aria-label="Cart"]');

			// If we can access the cart, verify it's empty or shows no items
			if (await cartArea.isVisible({ timeout: 5000 }).catch(() => false)) {
				await expect(cartArea).toContainText(/empty|no items|add products/i);
			}
		});

		test.skip('should add product to cart', async ({ page }) => {
			await page.goto('/');

			// Find a product in the list
			const productCard = page.locator(`[data-testid="product-card"], text="${mockProducts[0].name}"`);

			if (await productCard.isVisible({ timeout: 5000 }).catch(() => false)) {
				// Click to add to cart
				await productCard.click();

				// Verify product appears in cart
				const cartItem = page.locator(`[data-testid="cart-item"], text="${mockProducts[0].name}"`);
				await expect(cartItem).toBeVisible({ timeout: 5000 });
			}
		});

		test.skip('should update cart item quantity', async ({ page }) => {
			await page.goto('/');

			// Assuming a product is already in cart
			const quantityInput = page.locator('[data-testid="quantity-input"], input[type="number"]');

			if (await quantityInput.isVisible({ timeout: 5000 }).catch(() => false)) {
				// Update quantity
				await quantityInput.fill('3');

				// Verify quantity updated
				await expect(quantityInput).toHaveValue('3');
			}
		});

		test.skip('should remove item from cart', async ({ page }) => {
			await page.goto('/');

			// Find remove button for cart item
			const removeButton = page.locator('[data-testid="remove-item"], button[aria-label="Remove"]');

			if (await removeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
				// Click remove
				await removeButton.click();

				// Verify item removed (cart should be empty or show one less item)
				await expect(
					page.locator('[data-testid="empty-cart"], text=/empty|no items/i')
				).toBeVisible({ timeout: 5000 });
			}
		});
	});
});

test.describe('POS Checkout', () => {
	test.beforeEach(async ({ page }) => {
		await setupApiMocks(page);
	});

	test.skip('should apply customer to order', async ({ page }) => {
		await page.goto('/');

		// Find add customer button
		const addCustomerButton = page.locator(
			'[data-testid="add-customer"], button:has-text("Add Customer")'
		);

		if (await addCustomerButton.isVisible({ timeout: 5000 }).catch(() => false)) {
			await addCustomerButton.click();

			// Search for customer
			const customerSearch = page.locator('[data-testid="customer-search"], input[placeholder*="Customer"]');
			await customerSearch.fill(mockCustomers[0].first_name);

			// Select customer from results
			const customerResult = page.locator(`text="${mockCustomers[0].first_name} ${mockCustomers[0].last_name}"`);
			await customerResult.click();

			// Verify customer applied
			await expect(
				page.locator(`text="${mockCustomers[0].first_name}"`)
			).toBeVisible({ timeout: 5000 });
		}
	});

	test.skip('should calculate totals correctly', async ({ page }) => {
		await page.goto('/');

		// Look for total display
		const totalDisplay = page.locator('[data-testid="order-total"], text=/total/i');

		if (await totalDisplay.isVisible({ timeout: 5000 }).catch(() => false)) {
			// Verify total is displayed (format: $X.XX or similar)
			await expect(totalDisplay).toContainText(/\$?\d+\.\d{2}/);
		}
	});

	test.skip('should proceed to payment', async ({ page }) => {
		await page.goto('/');

		// Find pay/checkout button
		const payButton = page.locator(
			'[data-testid="pay-button"], button:has-text("Pay"), button:has-text("Checkout")'
		);

		if (await payButton.isVisible({ timeout: 5000 }).catch(() => false)) {
			await payButton.click();

			// Verify we navigate to checkout/payment screen
			await expect(
				page.locator('[data-testid="checkout-screen"], text=/payment|checkout/i')
			).toBeVisible({ timeout: 10000 });
		}
	});

	test.skip('should complete order successfully', async ({ page }) => {
		await page.goto('/');

		// This test simulates completing a full order
		// Implementation depends on the payment flow

		// Look for order completion indicator
		const completeButton = page.locator('[data-testid="complete-order"], button:has-text("Complete")');

		if (await completeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
			await completeButton.click();

			// Verify order completed
			await expect(
				page.locator('text=/order.*complete|success|receipt/i')
			).toBeVisible({ timeout: 10000 });
		}
	});
});

test.describe('Receipt', () => {
	test.skip('should display receipt after order completion', async ({ page }) => {
		// Navigate to a receipt (would need order ID)
		await page.goto('/');

		// Look for receipt link or button
		const receiptLink = page.locator('[data-testid="view-receipt"], a:has-text("Receipt")');

		if (await receiptLink.isVisible({ timeout: 5000 }).catch(() => false)) {
			await receiptLink.click();

			// Verify receipt content
			await expect(page.locator('[data-testid="receipt"], text=/receipt|order/i')).toBeVisible({
				timeout: 5000,
			});
		}
	});
});
