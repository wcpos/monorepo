import { expect, type Page } from '@playwright/test';

import { authenticatedTest as test } from './fixtures';

/** Helper to add the first simple product to the cart. Works in both grid and table view. */
async function addFirstProductToCart(page: Page) {
	const tile = page.getByTestId('product-tile').first();
	const tableButton = page.getByTestId('add-to-cart-button').first();

	// Wait for products to render in whichever view mode is active
	await expect(tile.or(tableButton)).toBeVisible({ timeout: 15_000 });

	if (await tile.isVisible()) {
		await tile.click();
	} else {
		await tableButton.click();
	}
	await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 10_000 });
}

/**
 * Open the cart "+" dropdown menu and click a menu item by testID.
 * The add-cart-item actions (Fee, Shipping, etc.) are now behind a single
 * dropdown trigger in the cart header.
 */
async function openCartMenuAndClick(page: Page, menuItemTestId: string) {
	await page.getByTestId('add-cart-item-menu').click();
	const menuItem = page.getByTestId(menuItemTestId);
	await expect(menuItem).toBeVisible({ timeout: 5_000 });
	await menuItem.click();
}

test.describe('POS Cart', () => {
	test('should show guest customer by default', async ({ posPage: page }) => {
		await expect(page.getByTestId('cart-customer-name')).toBeVisible();
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
		await page.getByTestId('numpad-done-button').click();
		await page.waitForTimeout(500);
	});

	test('should allow entering multiple digits in numpad without resetting', async ({
		posPage: page,
	}) => {
		await addFirstProductToCart(page);

		const quantityButton = page.getByTestId('cart-quantity-input').first();
		await expect(quantityButton).toBeVisible({ timeout: 15_000 });
		await quantityButton.click();

		const numpad = page.locator('[data-radix-popper-content-wrapper]').first();
		await expect(numpad).toBeVisible({ timeout: 15_000 });
		const numpadInput = numpad.locator('input');
		await expect(numpadInput).toBeVisible({ timeout: 10_000 });
		await numpadInput.click();

		// Append two digits to the default quantity (1) and verify they stick.
		// We assert the numeric tail to tolerate locale formatting (eg "1.23").
		await numpadInput.type('23', { delay: 100 });
		await expect
			.poll(async () => (await numpadInput.inputValue()).replace(/\D/g, ''), {
				timeout: 10_000,
			})
			.toMatch(/123$/);

		await page.getByTestId('numpad-done-button').click();
		await page.waitForTimeout(500);
	});

	test('should add multiple different products', async ({ posPage: page }) => {
		// Works in both grid (product-tile) and table (add-to-cart-button) views
		const tile = page.getByTestId('product-tile');
		const tableButton = page.getByTestId('add-to-cart-button');

		// Wait for products to render in whichever view mode is active
		await expect(tile.first().or(tableButton.first())).toBeVisible({ timeout: 15_000 });

		const isTileVisible = await tile.first().isVisible();
		const buttons = isTileVisible ? tile : tableButton;

		await buttons.nth(0).click();
		await page.waitForTimeout(500);

		await buttons.nth(1).click();
		await page.waitForTimeout(500);

		await expect(page.getByTestId('checkout-button')).toBeVisible();
	});

	test('should void an order to clear cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('void-button').click();
		await page.waitForTimeout(1_500);

		await expect(page.getByTestId('checkout-button')).not.toBeVisible({
			timeout: 10_000,
		});
	});

	test('should show subtotal in cart totals', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await expect(page.getByTestId('cart-subtotal')).toBeVisible({ timeout: 15_000 });
	});

	test('should show cart total in checkout button', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		const checkoutButton = page.getByTestId('checkout-button');
		const buttonText = await checkoutButton.textContent();
		expect(buttonText).toMatch(/\d/);
	});
});

test.describe('POS Cart - Add Items Menu', () => {
	test('should show the add-cart-item dropdown menu', async ({ posPage: page }) => {
		const trigger = page.getByTestId('add-cart-item-menu');
		await expect(trigger).toBeVisible({ timeout: 15_000 });
		await trigger.click();

		// All non-pro menu items should be visible
		await expect(page.getByTestId('menu-add-misc-product')).toBeVisible({ timeout: 5_000 });
		await expect(page.getByTestId('menu-add-fee')).toBeVisible();
		await expect(page.getByTestId('menu-add-shipping')).toBeVisible();
	});

	test('should add a fee via the dropdown menu', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await openCartMenuAndClick(page, 'menu-add-fee');

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible({ timeout: 15_000 });
		const addToCartButton = page.getByTestId('add-to-cart-submit');
		await expect(addToCartButton).toBeVisible({ timeout: 15_000 });
		await addToCartButton.click();
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
	});

	test('should add shipping via the dropdown menu', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await openCartMenuAndClick(page, 'menu-add-shipping');

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible({ timeout: 15_000 });
		const addToCartButton = page.getByTestId('add-to-cart-submit');
		await expect(addToCartButton).toBeVisible({ timeout: 15_000 });
		await addToCartButton.click();
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
	});

	test('should add a miscellaneous product via the dropdown menu', async ({ posPage: page }) => {
		await openCartMenuAndClick(page, 'menu-add-misc-product');

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible({ timeout: 15_000 });
		const addToCartButton = page.getByTestId('add-to-cart-submit');
		await expect(addToCartButton).toBeVisible({ timeout: 15_000 });
		await addToCartButton.click();
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
	});

	test('should close the dialog without adding an item', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await openCartMenuAndClick(page, 'menu-add-fee');

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible({ timeout: 15_000 });

		// Close via Escape key
		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible({ timeout: 5_000 });
	});
});
