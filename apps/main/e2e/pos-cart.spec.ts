import { expect, type Page } from '@playwright/test';

import {
	addCheckoutProbeProduct,
	isolatedProductTest as test,
	tryAddRunPrivateSimpleProduct,
} from './checkout-probe';
import {
	expectMoneyMatches,
	expectRateSetParity,
	expectTaxParity,
	isPushOrdersResponse,
	liveOrderTest as liveTest,
	newRunLabel,
	type OrderPayload,
	type ServerOrder,
	stampRunLabel,
} from './order-lifecycle';

/** Add the run-private simple product, or the shared-SKU fallback on secretless forks. */
async function addFirstProductToCart(page: Page) {
	await addCheckoutProbeProduct(page);
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
		if (await tryAddRunPrivateSimpleProduct(page)) {
			expect(await tryAddRunPrivateSimpleProduct(page, 1)).toBe(true);
			return;
		}

		// Secretless forks retain the former two-catalog-product path below.
		// Works in both grid (product-tile) and table (add-to-cart-button) views
		const tile = page.getByTestId('product-tile');
		const tableButton = page.getByTestId('add-to-cart-button');

		// Wait for products to render in whichever view mode is active
		await expect(tile.first().or(tableButton.first())).toBeVisible({ timeout: 15_000 });

		// A marker already settled visible above; one-shot picks which view rendered.
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

/**
 * SAVE-TO-SERVER TOTALS PARITY — the regression that motivated the whole
 * tax-parity oracle (woocommerce-pos#1545): a one-product cart saved to the
 * server came back with DIFFERENT totals (server taxed from the site base
 * instead of the POS store), and the only symptom was the "your store changed
 * this order's totals" banner. Parity is the invariant; the banner is the
 * cashier-facing alarm. This spec asserts both, store-agnostically: whatever
 * this store's rates are, the server must agree with the POS about them.
 *
 * Writes to the shared live store → follows the labelling and cleanup
 * contract in order-lifecycle.ts.
 */
liveTest.describe('POS Cart - save to server parity (live store)', () => {
	liveTest(
		'a plain one-product cart saves with identical totals and no divergence banner',
		async ({ posPage: page, trackOrder }) => {
			const label = newRunLabel();
			await addFirstProductToCart(page);
			await stampRunLabel(page, label);

			// The cart total the cashier sees, captured before the save. Raw trimmed
			// text, NOT digits-only (#1114 review): stripping separators collapses
			// decimal position ("45.00" and "450.0" both become "4500"), and since
			// this exact string is later compared against the SAME source, the
			// verbatim text is both safe across locales and strictly stronger.
			const checkoutButton = page.getByTestId('checkout-button');
			const cartTotalText = ((await checkoutButton.textContent()) ?? '').trim();
			expect(cartTotalText, 'cart must show a total').not.toBe('');
			expect(cartTotalText, 'cart total must contain an amount').toMatch(/\d/);

			const saved = page.waitForResponse((response) => isPushOrdersResponse(response), {
				timeout: 90_000,
			});
			saved.catch(() => {});

			await page.getByTestId('save-to-server-button').click();
			const response = await saved;
			expect(response.status(), 'save to server must succeed').toBeLessThan(400);

			const envelope = (response.request().postDataJSON() ?? {}) as {
				recordId?: string;
				payload?: OrderPayload;
			};
			const sent = envelope.payload ?? {};
			const ack = (await response.json().catch(() => null)) as {
				document?: ServerOrder;
			} | null;
			const doc = ack?.document;
			expect(doc?.id, 'ack must carry the created order').toBeTruthy();
			trackOrder({ id: Number(doc!.id), uuid: envelope.recordId, label });

			// PARITY: the server recorded the numbers the POS rang up. Rate-set
			// equality first — a tax-location mismatch swaps the rate SET even when
			// amounts land close together. Unconditional over both sets (#1114
			// review): [] === [] on a tax-free store, and a dropped client
			// tax_lines fails instead of skipping.
			expectRateSetParity(
				sent.tax_lines,
				doc!.tax_lines,
				'server tax rates must equal the rates the POS applied'
			);
			if (sent.total !== undefined) {
				expectMoneyMatches(doc!.total, sent.total, 'order total parity (cart vs server)');
			}
			if (sent.cart_tax !== undefined) {
				expectTaxParity(doc!.cart_tax, sent.cart_tax, 'cart_tax parity');
			}

			// The money the cashier sees must be stable across the save. Wait for the
			// TERMINAL write signal first (#1114 review): the save button re-enables
			// when the round trip completes, so the reconciliation that could rewrite
			// the rendered total has run before we compare — a bare toPass would
			// succeed instantly on the pre-save rendering.
			await expect(page.getByTestId('save-to-server-button')).toBeEnabled({ timeout: 30_000 });
			const totalNow = ((await checkoutButton.textContent()) ?? '').trim();
			expect(totalNow, 'cart total must be unchanged by the save round trip').toBe(cartTotalText);

			// RE-ARMED (was parked on woocommerce-pos#1548): the client now emits
			// tax_lines at WooCommerce STORAGE precision (mono#1117 — raw 6dp
			// per-rate sums under round-at-subtotal), so a plain sale's ack matches
			// what the cart pushed and the cashier-facing alarm must stay down.
			await page.waitForTimeout(1_500);
			await expect(
				page.getByTestId('order-totals-changed-banner'),
				'a plain sale must not trigger the totals-changed banner'
			).not.toBeVisible();
		}
	);
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
