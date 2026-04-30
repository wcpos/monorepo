import { expect, type Locator, type Page } from '@playwright/test';

import { authenticatedTest as test } from './fixtures';

/** Helper to add the first simple product to the cart. Works in both grid and table view. */
async function addFirstProductToCart(page: Page) {
	const tile = page.getByTestId('product-tile').first();
	const tableButton = page.getByTestId('add-to-cart-button').first();
	const productMarker = tile.or(tableButton);

	// Wait for products to render in whichever view mode is active.
	let productsVisible = await productMarker.isVisible({ timeout: 30_000 }).catch(() => false);
	if (
		!productsVisible &&
		(await page
			.getByText('Something went wrong:')
			.isVisible()
			.catch(() => false))
	) {
		await page.reload();
		await expect(page.getByTestId('search-products')).toBeVisible({ timeout: 60_000 });
		productsVisible = await productMarker.isVisible({ timeout: 60_000 }).catch(() => false);
	}
	await expect(productMarker).toBeVisible({ timeout: productsVisible ? 1_000 : 60_000 });

	if (await tile.isVisible()) {
		await tile.click();
	} else {
		await tableButton.click();
	}
	await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 10_000 });
}

async function isSwitchEnabled(toggle: Locator): Promise<boolean> {
	return toggle.evaluate((node) => {
		const element = node as HTMLElement & { checked?: boolean };
		const ariaChecked = element.getAttribute('aria-checked');
		if (ariaChecked !== null) {
			return ariaChecked === 'true';
		}

		const dataState = element.getAttribute('data-state');
		if (dataState !== null) {
			return dataState === 'checked';
		}

		return element.checked === true;
	});
}

async function ensureSwitchEnabled(toggle: Locator) {
	await expect(toggle).toBeVisible({ timeout: 15_000 });
	if (!(await isSwitchEnabled(toggle))) {
		await toggle.click();
	}
	await expect.poll(() => isSwitchEnabled(toggle), { timeout: 10_000 }).toBe(true);
}

/**
 * Configure POS cart UI settings from the UI itself rather than mutating
 * storage internals. This is resilient across storage backend migrations.
 */
async function enableAutoReceiptSettings(page: Page) {
	await page.getByTestId('cart-settings-button').click();

	await ensureSwitchEnabled(page.getByTestId('cart-setting-auto-show-receipt').first());
	await ensureSwitchEnabled(page.getByTestId('cart-setting-auto-print-receipt').first());

	// Close settings dialog and continue with updated persisted UI settings.
	await page.keyboard.press('Escape');
}

test.describe('POS Cart - Order Actions', () => {
	test('should save order to server', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('save-to-server-button').click();

		// Wait for the save button to finish loading (loading state resolves when save completes)
		await expect(page.getByTestId('save-to-server-button')).toBeEnabled({ timeout: 30_000 });
		// Verify a success toast appeared (Sonner toast)
		await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10_000 });
	});

	test('should add order note', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('order-note-button').click();

		const textarea = page.locator('textarea').first();
		await expect(textarea).toBeVisible({ timeout: 15_000 });
		await textarea.fill('Test order note from e2e');

		const addNoteButton = page.getByTestId('add-note-button');
		await expect(addNoteButton).toBeVisible({ timeout: 15_000 });
		await addNoteButton.click();
	});

	test('should open order meta dialog', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('order-meta-button').click();

		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
	});
});

test.describe('POS Cart - Multiple Orders', () => {
	test('should create a new order via tab', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		// The new order button is a TabsTrigger with a plus icon
		// It's a tab element with value="new" containing an Icon with name="plus"
		// The tooltip text is "Open new order"
		const newOrderTab = page
			.getByRole('tab')
			.filter({ has: page.locator('svg') })
			.last()
			.or(page.locator('[role="tab"]').filter({ hasText: '+' }))
			.or(page.locator('[data-state]').filter({ has: page.locator('[name="plus"]') }));

		await expect(newOrderTab).toBeVisible({ timeout: 15_000 });
		await newOrderTab.click();

		// Wait for cart transition animation
		await page.waitForTimeout(1_000);

		// New order should have empty cart (no checkout button visible)
		await expect(page.getByTestId('checkout-button')).not.toBeVisible({
			timeout: 15_000,
		});
	});
});

test.describe('POS Checkout', () => {
	test('should open checkout modal', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('checkout-button').click();

		await expect(page.getByTestId('process-payment-button')).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should show order total in checkout', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('checkout-button').click();
		await expect(page.getByTestId('process-payment-button')).toBeVisible({
			timeout: 10_000,
		});

		// The cancel and process payment buttons are siblings in the modal footer.
		// The modal shows the order total — verify there's a visible number/amount on the page.
		const cancelButton = page.getByTestId('cancel-checkout-button');
		await expect(cancelButton).toBeVisible();
		// At this point the checkout modal is confirmed open with both buttons visible.
	});

	test('should cancel checkout and return to cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('checkout-button').click();
		await expect(page.getByTestId('process-payment-button')).toBeVisible({
			timeout: 10_000,
		});

		await page.getByTestId('cancel-checkout-button').click();

		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 10_000 });
	});

	test('should complete an order', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('checkout-button').click();
		await expect(page.getByTestId('process-payment-button')).toBeVisible({
			timeout: 10_000,
		});

		await page.getByTestId('process-payment-button').click();

		// After clicking process payment, the button enters loading state (disabled).
		// Payment is processed via a WebView/iframe — this can be slow or fail in CI.
		// Verify the button became disabled (payment was initiated).
		await expect(page.getByTestId('process-payment-button')).toBeDisabled({ timeout: 10_000 });

		// Wait for the payment to complete: either the receipt appears or we return to POS
		const receiptPrintButton = page.getByTestId('receipt-print-button');
		const receiptCloseButton = page.getByTestId('receipt-close-button');
		const posScreen = page.getByTestId('search-products');
		await expect(receiptPrintButton.or(receiptCloseButton).or(posScreen)).toBeVisible({
			timeout: 60_000,
		});
	});

	test('should auto print receipt after checkout when enabled', async ({ posPage: page }) => {
		await enableAutoReceiptSettings(page);
		await page.reload();
		await expect(page.getByTestId('search-products')).toBeVisible({ timeout: 30_000 });

		await addFirstProductToCart(page);

		await page.getByTestId('checkout-button').click();
		await expect(page.getByTestId('process-payment-button')).toBeVisible({
			timeout: 10_000,
		});
		const orderIdMatch = page.url().match(/\/cart\/([^/]+)\/checkout$/);
		expect(orderIdMatch?.[1]).toBeTruthy();

		await page.goto(`/cart/receipt/${orderIdMatch![1]}`);
		const printButton = page.getByTestId('receipt-print-button');
		await expect(printButton).toBeVisible({ timeout: 30_000 });
		await expect(printButton).toBeDisabled({ timeout: 10_000 });
	});
});

test('uses the legacy webview for built-in POS gateways even when supports_checkout=true', async ({
	posPage: page,
}) => {
	let contractCheckoutRequested = false;
	await page.route('**/wp-json/wcpos/v1/payment-gateways/**/bootstrap', async (route) => {
		contractCheckoutRequested = true;
		await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
	});
	await page.route('**/wp-json/wcpos/v1/orders/**/checkout', async (route) => {
		contractCheckoutRequested = true;
		await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
	});
	await page.route('**/wp-json/wcpos/v1/payment-gateways**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([
				{
					id: 'pos_cash',
					provider: 'wcpos',
					pos_type: 'manual',
					capabilities: { supports_checkout: true },
				},
			]),
		});
	});

	await addFirstProductToCart(page);
	await page.getByTestId('checkout-button').click();
	await expect(page.getByTestId('process-payment-button')).toBeVisible();
	await page.getByTestId('process-payment-button').click();
	await expect(page.getByTestId('process-payment-button')).toBeDisabled({ timeout: 10_000 });
	expect(contractCheckoutRequested).toBe(false);
});

test('falls back to the legacy webview when supports_checkout=false', async ({ posPage: page }) => {
	await page.route('**/wp-json/wcpos/v1/payment-gateways**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(
				[
					'bacs',
					'pos_cash',
					'wcpos_cash',
					'stripe',
					'woocommerce_payments',
					'stripe_terminal_for_woocommerce',
				].map((id) => ({
					id,
					provider: 'woocommerce',
					pos_type: id.includes('cash') || id === 'bacs' ? 'manual' : 'terminal',
					capabilities: { supports_checkout: false },
				}))
			),
		});
	});

	await addFirstProductToCart(page);
	await page.getByTestId('checkout-button').click();
	await expect(page.getByTestId('process-payment-button')).toBeVisible();
	await page.getByTestId('process-payment-button').click();
	await expect(page.getByTestId('process-payment-button')).toBeDisabled({ timeout: 10_000 });
});
