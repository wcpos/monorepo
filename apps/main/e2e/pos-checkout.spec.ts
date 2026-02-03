import { expect, type Page } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

/** Helper to add the first simple product to the cart */
async function addFirstProductToCart(page: Page) {
	await page.getByTestId('add-to-cart-button').first().click();
	await expect(page.getByRole('button', { name: /Checkout/ })).toBeVisible({ timeout: 10_000 });
}

/**
 * Click the icon button that is a sibling of a text label in the cart area.
 * The cart action buttons (Add Fee, Add Shipping, etc.) are rendered as
 * <HStack><Text>Add Fee</Text><IconButton /></HStack>
 */
async function clickCartActionButton(page: Page, label: string) {
	const row = page.locator(`text="${label}"`).locator('..');
	await row.locator('button').click();
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
		await expect(quantityButton).toBeVisible({ timeout: 15_000 });
		await quantityButton.click();

		const numpad = page.locator('[data-radix-popper-content-wrapper]').first();
		await expect(numpad).toBeVisible({ timeout: 15_000 });
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

	test('should void an order to clear cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: 'Void' }).click();
		await page.waitForTimeout(1_500);

		await expect(page.getByRole('button', { name: /Checkout/ })).not.toBeVisible({
			timeout: 10_000,
		});
	});

	test('should show subtotal in cart totals', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await expect(page.getByText('Subtotal')).toBeVisible({ timeout: 15_000 });
	});

	test('should show cart total in checkout button', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		const checkoutButton = page.getByRole('button', { name: /Checkout/ });
		const buttonText = await checkoutButton.textContent();
		expect(buttonText).toMatch(/\d/);
	});
});

test.describe('POS Cart - Fees', () => {
	test('should add a fee to the cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await clickCartActionButton(page, 'Add Fee');

		const addToCartButton = page.getByRole('button', { name: 'Add to Cart' });
		await expect(addToCartButton).toBeVisible({ timeout: 15_000 });
		await addToCartButton.click();
		await expect(page.getByRole('button', { name: /Checkout/ })).toBeVisible({ timeout: 15_000 });
	});

	test('should add shipping to the cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await clickCartActionButton(page, 'Add Shipping');

		const addToCartButton = page.getByRole('button', { name: 'Add to Cart' });
		await expect(addToCartButton).toBeVisible({ timeout: 15_000 });
		await addToCartButton.click();
		await expect(page.getByRole('button', { name: /Checkout/ })).toBeVisible({ timeout: 15_000 });
	});

	test('should add a miscellaneous product', async ({ posPage: page }) => {
		await clickCartActionButton(page, 'Add Miscellaneous Product');

		const addToCartButton = page.getByRole('button', { name: 'Add to Cart' });
		await expect(addToCartButton).toBeVisible({ timeout: 15_000 });
		await addToCartButton.click();
		await expect(page.getByRole('button', { name: /Checkout/ })).toBeVisible({ timeout: 15_000 });
	});
});

test.describe('POS Cart - Order Actions', () => {
	test('should save order to server', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: 'Save to Server' }).click();

		await expect(page.getByText(/saved|order #/i).first()).toBeVisible({ timeout: 30_000 });
	});

	test('should add order note', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: 'Order Note' }).click();

		const textarea = page.locator('textarea').first();
		await expect(textarea).toBeVisible({ timeout: 15_000 });
		await textarea.fill('Test order note from e2e');

		const addNoteButton = page.getByRole('button', { name: /Add Note/i });
		await expect(addNoteButton).toBeVisible({ timeout: 15_000 });
		await addNoteButton.click();
	});

	test('should open order meta dialog', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: 'Order Meta' }).click();

		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
	});
});

test.describe('POS Cart - Multiple Orders', () => {
	test('should create a new order via tab', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		const newOrderButton = page.getByRole('button', { name: /new order/i }).or(
			page.locator('button').filter({ hasText: '+' })
		);
		await expect(newOrderButton.first()).toBeVisible({ timeout: 15_000 });
		await newOrderButton.first().click();

		await expect(page.getByRole('button', { name: /Checkout/ })).not.toBeVisible({
			timeout: 15_000,
		});
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

		await expect(page.getByText(/amount|total|pay/i).first()).toBeVisible();
	});

	test('should cancel checkout and return to cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByRole('button', { name: /Checkout/ }).click();
		await expect(page.getByRole('button', { name: /Process Payment/ })).toBeVisible({
			timeout: 10_000,
		});

		await page.getByRole('button', { name: /Cancel/i }).click();

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
});
