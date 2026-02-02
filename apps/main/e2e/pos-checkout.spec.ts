import { expect } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

/** Helper to add the first simple product to the cart */
async function addFirstProductToCart(page: import('@playwright/test').Page) {
	const firstRow = page.getByRole('row').filter({ hasText: /\d+[,.]?\d*\s*\$/ }).first();
	const addButton = firstRow.getByRole('button').last();
	await addButton.click();
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

		const quantityInput = page.locator('[aria-labelledby="cart-table"] input').first();
		await expect(quantityInput).toBeVisible({ timeout: 5_000 });
		await quantityInput.fill('3');
		await quantityInput.press('Enter');
		await expect(quantityInput).toHaveValue('3');
	});

	test('should add multiple different products', async ({ posPage: page }) => {
		const productRows = page.getByRole('row').filter({ hasText: /\d+[,.]?\d*\s*\$/ });

		await productRows.nth(0).getByRole('button').last().click();
		await page.waitForTimeout(500);

		await productRows.nth(1).getByRole('button').last().click();
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
