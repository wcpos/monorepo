import { expect, type Page } from '@playwright/test';

import { getStoreVariant, authenticatedTest as test } from './fixtures';

async function addFirstProductToCart(page: Page) {
	const tile = page.getByTestId('product-tile').first();
	const tableButton = page.getByTestId('add-to-cart-button').first();
	const productMarker = tile.or(tableButton).first();

	const hasCatalogProduct = await productMarker.isVisible({ timeout: 30_000 }).catch(() => false);

	if (hasCatalogProduct && (await tile.isVisible())) {
		await tile.click();
	} else if (hasCatalogProduct) {
		await tableButton.click();
	} else {
		const demoProduct = page.getByText(/^(Album|Beanie|Cap|Single)$/).first();
		if (await demoProduct.isVisible({ timeout: 30_000 }).catch(() => false)) {
			await demoProduct.click();
		} else {
			await page.getByTestId('add-cart-item-menu').click();
			await page.getByTestId('menu-add-misc-product').click();
			const dialog = page.getByRole('dialog');
			await expect(dialog).toBeVisible({ timeout: 15_000 });
			await dialog.getByRole('button', { name: /0/ }).click();
			const numpad = page.locator('[data-radix-popper-content-wrapper]').first();
			await expect(numpad).toBeVisible({ timeout: 15_000 });
			const numpadInput = numpad.locator('input');
			await numpadInput.fill('15');
			await page.getByTestId('numpad-done-button').click();
			await page.getByTestId('add-to-cart-submit').click();
		}
	}
	await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
}

async function createCompletedOrder(page: Page) {
	await addFirstProductToCart(page);
	await page.getByTestId('checkout-button').click();
	await expect(page.getByTestId('process-payment-button')).toBeVisible({ timeout: 15_000 });

	const orderUuid = page.url().match(/\/cart\/([^/]+)\/checkout$/)?.[1];
	expect(orderUuid).toBeTruthy();

	await page.getByTestId('process-payment-button').click();
	await expect(page.getByTestId('process-payment-button')).toBeDisabled({ timeout: 10_000 });

	const receiptPrintButton = page.getByTestId('receipt-print-button');
	const receiptCloseButton = page.getByTestId('receipt-close-button');
	const posScreen = page.getByTestId('search-products');
	await expect(receiptPrintButton.or(receiptCloseButton).or(posScreen)).toBeVisible({
		timeout: 60_000,
	});

	return orderUuid!;
}

async function interceptRefundDependencies(page: Page) {
	const unsupportedProviderRefundGatewayId = 'unsupported_provider_refunds';
	const gatewayIds = [
		unsupportedProviderRefundGatewayId,
		'stripe_terminal_for_woocommerce',
		'wcpos_cash',
		'pos_cash',
		'cash',
		'cod',
		'cash_on_delivery',
		'bacs',
		'cheque',
		'',
		'wcpos_card',
		'pos_card',
		'woocommerce_payments',
		'wcpay',
		'stripe',
		'stripe_terminal',
		'stripe_cc',
		'woocommerce_payments_pos',
		'square_credit_card',
		'square_cash_app_pay',
	];

	await page.route('**/payment-gateways**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(
				gatewayIds.map((id) => ({
					id,
					title: id || 'Default payment gateway',
					capabilities: {
						supports_provider_refunds: id !== unsupportedProviderRefundGatewayId,
						supports_checkout: true,
					},
				}))
			),
		});
	});
}

async function openRefundModalForNewCompletedOrder(page: Page) {
	await interceptRefundDependencies(page);
	const orderUuid = await createCompletedOrder(page);
	await page.goto(`/orders/refund/${orderUuid}`);
	await expect(page.getByTestId('refund-custom-amount')).toBeVisible({ timeout: 30_000 });
	await page.getByTestId('refund-custom-amount').fill('10.00');
}

test.describe('POS refunds (Pro)', () => {
	// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(getStoreVariant(testInfo) !== 'pro', 'Refund UI requires Pro');
	});

	test('submits refund_destination=cash for a non-cash order', async ({ posPage: page }) => {
		let refundPayload: any = null;
		await page.route('**/wp-json/wcpos/v1/orders/*/refunds**', async (route) => {
			refundPayload = route.request().postDataJSON();
			await route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({
					refund_id: 999,
					refund_result: { destination: 'cash', mode: 'manual' },
				}),
			});
		});

		await openRefundModalForNewCompletedOrder(page);
		await expect(page.getByTestId('refund-destination-original_method')).toBeChecked({
			timeout: 15_000,
		});
		await expect(page.getByTestId('refund-destination-cash')).toBeVisible({ timeout: 15_000 });
		await page.getByTestId('refund-destination-cash').click();
		await expect(page.getByTestId('refund-destination-cash')).toBeChecked();
		await page.getByRole('button', { name: 'Process Refund' }).click();
		await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 10_000 });
		await page.getByRole('button', { name: 'Process Refund' }).last().click();

		await expect.poll(() => refundPayload?.refund_destination, { timeout: 15_000 }).toBe('cash');
		expect(refundPayload?.api_refund).toBe(false);
	});

	test('submits refund_destination=original_method when provider refunds are supported', async ({
		posPage: page,
	}) => {
		let refundPayload: any = null;
		await page.route('**/wp-json/wcpos/v1/orders/*/refunds**', async (route) => {
			refundPayload = route.request().postDataJSON();
			await route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({
					refund_id: 1000,
					refund_result: { destination: 'original_method', mode: 'provider' },
				}),
			});
		});

		await openRefundModalForNewCompletedOrder(page);
		await expect(page.getByTestId('refund-destination-original_method')).toBeChecked({
			timeout: 15_000,
		});
		await expect(page.getByTestId('refund-destination-original_method')).toBeEnabled();
		await page.getByTestId('refund-destination-original_method').click();
		await page.getByRole('button', { name: 'Process Refund' }).click();
		await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 10_000 });
		await page.getByRole('button', { name: 'Process Refund' }).last().click();

		await expect
			.poll(() => refundPayload?.refund_destination, { timeout: 15_000 })
			.toBe('original_method');
		expect(refundPayload?.api_refund).toBe(true);
	});
});
