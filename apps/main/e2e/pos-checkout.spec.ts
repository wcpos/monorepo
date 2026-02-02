import { expect } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

/** Helper to add the first simple product to the cart */
async function addFirstProductToCart(page: import('@playwright/test').Page) {
	await page.getByTestId('add-to-cart-button').first().click();
	await expect(page.getByRole('button', { name: /Checkout/ })).toBeVisible({ timeout: 10_000 });
}

/**
 * POS cart and checkout tests.
 * Uses the authenticatedTest fixture which handles OAuth login.
 */
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

		// Numpad popover opens - clear and type new value, then confirm
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
});

test.describe('POS Checkout', () => {
	test('should open checkout modal', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: /Checkout/ }).click();

		await expect(page.getByRole('button', { name: /Process Payment/ })).toBeVisible({
			timeout: 10_000,
		});
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
});
