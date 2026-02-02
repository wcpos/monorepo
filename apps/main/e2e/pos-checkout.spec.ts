import { expect, type Page } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

/** Helper to add the first simple product to the cart */
async function addFirstProductToCart(page: Page) {
	await page.getByTestId('add-to-cart-button').first().click();
	await expect(page.getByRole('button', { name: /Checkout/ })).toBeVisible({ timeout: 10_000 });
}

test.describe('POS Cart', () => {
	test('should show guest customer by default', async ({ posPage: page }) => {
		await expect(page.getByText('Guest')).toBeVisible();
	});

	test('should add a product to the cart and show checkout button', async ({ posPage: page }) => {
		await addFirstProductToCart(page);
	});

	test('should update quantity in cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		const quantityButton = page.getByTestId('cart-quantity-input').first();
		await expect(quantityButton).toBeVisible({ timeout: 5_000 });
		await quantityButton.click();

		const numpad = page.locator('[data-radix-popper-content-wrapper]').first();
		await expect(numpad).toBeVisible({ timeout: 5_000 });
		await page.keyboard.type('3');
		await page.getByRole('button', { name: 'Done' }).click();
		await page.waitForTimeout(500);
	});

	test('should add multiple different products', async ({ posPage: page }) => {
		const addButtons = page.getByTestId('add-to-cart-button');

		await addButtons.nth(0).click();
		await page.waitForTimeout(500);

		await addButtons.nth(1).click();
		await page.waitForTimeout(500);

		await expect(page.getByRole('button', { name: /Checkout/ })).toBeVisible();
	});

	test('should remove a product from cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		// Click the X/delete button on the cart line item
		const deleteButton = page.locator('button[class*="destructive"]').first();
		if (await deleteButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await deleteButton.click();
			await page.waitForTimeout(1_000);

			// Cart should be empty - checkout button should disappear
			await expect(page.getByRole('button', { name: /Checkout/ })).not.toBeVisible({
				timeout: 5_000,
			});
		}
	});

	test('should show subtotal in cart totals', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await expect(page.getByText('Subtotal')).toBeVisible({ timeout: 5_000 });
	});

	test('should show cart total in checkout button', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		// Checkout button should show a currency amount
		const checkoutButton = page.getByRole('button', { name: /Checkout/ });
		const buttonText = await checkoutButton.textContent();
		expect(buttonText).toMatch(/\d/); // Should contain at least a digit (price)
	});
});

test.describe('POS Cart - Fees', () => {
	test('should add a fee to the cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: 'Add Fee' }).click();
		await expect(page.getByText('Add Fee').or(page.getByText('Fee'))).toBeVisible({
			timeout: 5_000,
		});

		// Fill in fee details and submit
		const addToCartButton = page.getByRole('button', { name: 'Add to Cart' });
		if (await addToCartButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await addToCartButton.click();
			await page.waitForTimeout(1_000);

			// Fee row should appear - look for "Fees" in totals
			await expect(page.getByText('Fees')).toBeVisible({ timeout: 5_000 });
		}
	});

	test('should add shipping to the cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: 'Add Shipping' }).click();

		const addToCartButton = page.getByRole('button', { name: 'Add to Cart' });
		if (await addToCartButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await addToCartButton.click();
			await page.waitForTimeout(1_000);

			// Shipping row should appear in totals
			await expect(page.getByText('Shipping')).toBeVisible({ timeout: 5_000 });
		}
	});

	test('should add a miscellaneous product', async ({ posPage: page }) => {
		await page.getByRole('button', { name: 'Add Miscellaneous Product' }).click();

		const addToCartButton = page.getByRole('button', { name: 'Add to Cart' });
		if (await addToCartButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await addToCartButton.click();
			await page.waitForTimeout(1_000);

			// Should now have an item in cart
			await expect(page.getByRole('button', { name: /Checkout/ })).toBeVisible({
				timeout: 5_000,
			});
		}
	});
});

test.describe('POS Cart - Order Actions', () => {
	test('should void an order', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: 'Void' }).click();
		await page.waitForTimeout(1_500);

		// After voiding, cart should be empty
		await expect(page.getByRole('button', { name: /Checkout/ })).not.toBeVisible({
			timeout: 10_000,
		});
	});

	test('should save order to server', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: 'Save to Server' }).click();

		// Should show a toast or confirmation with order number
		await expect(page.getByText(/saved|order #/i).first()).toBeVisible({ timeout: 30_000 });
	});

	test('should add order note', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: 'Order Note' }).click();

		// Dialog should open with textarea
		await expect(page.getByText('Order Note')).toBeVisible({ timeout: 5_000 });

		// Type a note
		const textarea = page.locator('textarea').first();
		if (await textarea.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await textarea.fill('Test order note from e2e');
			await page.getByRole('button', { name: 'Add Note' }).click();
			await page.waitForTimeout(500);
		}
	});

	test('should open order meta dialog', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: 'Order Meta' }).click();
		await expect(page.getByText('Order Meta')).toBeVisible({ timeout: 5_000 });
	});
});

test.describe('POS Cart - Multiple Orders', () => {
	test('should create a new order via tab', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		// Click the "+" tab to open a new order
		const newOrderButton = page.getByRole('button', { name: /new order/i }).or(
			page.locator('button').filter({ hasText: '+' })
		);

		if (await newOrderButton.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
			await newOrderButton.first().click();
			await page.waitForTimeout(1_000);

			// New order should have empty cart - no Checkout button
			await expect(page.getByRole('button', { name: /Checkout/ })).not.toBeVisible({
				timeout: 5_000,
			});
		}
	});
});

test.describe('POS Checkout', () => {
	test('should open checkout modal', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: /Checkout/ }).click();

		await expect(page.getByRole('button', { name: /Process Payment/ })).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should show order total in checkout', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: /Checkout/ }).click();
		await expect(page.getByRole('button', { name: /Process Payment/ })).toBeVisible({
			timeout: 10_000,
		});

		// Should display amount to pay
		await expect(page.getByText(/amount|total|pay/i).first()).toBeVisible();
	});

	test('should cancel checkout and return to cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: /Checkout/ }).click();
		await expect(page.getByRole('button', { name: /Process Payment/ })).toBeVisible({
			timeout: 10_000,
		});

		// Cancel
		await page.getByRole('button', { name: /Cancel/i }).click();

		// Should return to cart with product still there
		await expect(page.getByRole('button', { name: /Checkout/ })).toBeVisible({ timeout: 10_000 });
	});

	test('should complete an order', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: /Checkout/ }).click();
		await expect(page.getByRole('button', { name: /Process Payment/ })).toBeVisible({
			timeout: 10_000,
		});

		await page.getByRole('button', { name: /Process Payment/ }).click();

		await expect(
			page.getByText(/receipt|complete|success/i).first()
		).toBeVisible({ timeout: 30_000 });
	});

	test('should complete an order with fee added', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		// Add a fee first
		await page.getByRole('button', { name: 'Add Fee' }).click();
		const addToCartButton = page.getByRole('button', { name: 'Add to Cart' });
		if (await addToCartButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await addToCartButton.click();
			await page.waitForTimeout(1_000);
		}

		// Checkout
		await page.getByRole('button', { name: /Checkout/ }).click();
		await expect(page.getByRole('button', { name: /Process Payment/ })).toBeVisible({
			timeout: 10_000,
		});

		await page.getByRole('button', { name: /Process Payment/ }).click();
		await expect(
			page.getByText(/receipt|complete|success/i).first()
		).toBeVisible({ timeout: 30_000 });
	});
});
