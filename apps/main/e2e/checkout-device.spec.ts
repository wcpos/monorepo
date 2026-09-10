import { expect, type Page } from '@playwright/test';

import {
	type Descriptor,
	ledgerRows,
	newOrderAtCheckout,
	pollOrder,
	readAmountMinor,
	requireTenderCheckout,
} from './checkout-shared';
import { wcposRestRoute } from './fixtures';
import { expectOrderPaid, liveOrderTest as liveTest } from './order-lifecycle';

function simulatedDevice(descriptors: Descriptor[]) {
	return descriptors.find((method) => {
		const capture = method.capture as { mode?: string; provider?: string } | undefined;
		return method.pos_enabled && capture?.mode === 'device' && capture.provider === 'simulated';
	});
}
async function connect(page: Page, reader: string) {
	await expect(page.getByTestId('checkout-keypad')).toBeVisible();
	await expect(page.getByTestId('checkout-reader-connect')).toBeEnabled();
	await page.getByTestId('checkout-reader-connect').click();
	await expect(page.getByTestId('checkout-reader-list')).toBeVisible();
	const option = page.getByTestId(`checkout-reader-option-${reader}`);
	const readerName = (await option.innerText()).trim();
	await option.click();
	// The reader name in this composite status identifies the completed switch.
	await expect(page.getByTestId('checkout-reader-status')).toContainText(readerName);
	await expect(page.getByTestId('checkout-take-payment')).toBeEnabled();
}
function paymentResponse(page: Page, orderId: number, action: string) {
	let unauthorized = false;
	const response = page.waitForResponse((response) => {
		if (
			response.request().method() !== 'POST' ||
			!new RegExp(`^/wcpos/v2/orders/${orderId}/payments/[^/]+/${action}$`).test(
				wcposRestRoute(response.url()) ?? ''
			)
		)
			return false;
		if (response.status() !== 401 || unauthorized) return true;
		unauthorized = true;
		return false;
	});
	response.catch(() => {});
	return response;
}
async function take(page: Page, orderId: number) {
	const intent = paymentResponse(page, orderId, 'intent');
	await page.getByTestId('checkout-take-payment').click();
	const response = await intent;
	expect(response.status()).toBeLessThan(400);
	expect(response.request().postDataJSON()).toMatchObject({
		payment: { capture_mode: 'device' },
		context: { transport: 'bluetooth' },
	});
	expect(await response.json()).toMatchObject({
		handoff: {
			client_secret: expect.any(String),
			payment_intent: expect.any(String),
			outcome_url: expect.any(String),
		},
	});
}

liveTest.describe('POS device capture with the simulated driver (live store)', () => {
	for (const scenario of ['approve', 'decline', 'cancel', 'tip'] as const) {
		liveTest(
			scenario,
			async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
				liveTest.slow();
				const { orderId, mode } = await newOrderAtCheckout(page, trackOrder);
				const { authorization, descriptors } = await requireTenderCheckout(
					request,
					testInfo,
					storeAuthorization,
					mode
				);
				const device = simulatedDevice(descriptors);
				liveTest.skip(!device, 'store has no simulated device capture descriptor');
				expect(device!.id).toBe('wcpos_simulated_device');
				await page.getByTestId(`checkout-tile-${device!.id}`).click();
				const amount = await readAmountMinor(page, 'checkout-entry');
				await connect(page, `sim-${scenario}`);
				const capture =
					scenario === 'approve' || scenario === 'tip'
						? paymentResponse(page, orderId, 'capture')
						: null;
				await take(page, orderId);
				if (scenario === 'cancel') {
					await expect(page.getByTestId('checkout-terminal-cancel')).toBeEnabled();
					const voided = paymentResponse(page, orderId, 'void');
					await page.getByTestId('checkout-terminal-cancel').click();
					expect((await voided).status()).toBeLessThan(400);
				}
				if (scenario === 'decline' || scenario === 'cancel') {
					await expect(page.getByTestId('checkout-terminal-retry')).toBeVisible();
					const failedOrder = await pollOrder(
						request,
						testInfo,
						authorization,
						orderId,
						(order) =>
							ledgerRows(order).some((row) =>
								scenario === 'decline'
									? row.status === 'failed' || row.status === 'voided'
									: row.status === 'voided'
							),
						'reader rejection must not mark the sale paid'
					);
					expect(ledgerRows(failedOrder)).toHaveLength(1);
					expect(failedOrder.date_paid ?? failedOrder.date_paid_gmt).toBeFalsy();
					if (scenario === 'cancel') return;
					const declined = ledgerRows(failedOrder)[0] as {
						failure_reason?: string | null;
						events?: unknown[];
					};
					expect(
						declined.failure_reason === 'card_declined' ||
							JSON.stringify(declined.events ?? []).includes('card_declined')
					).toBe(true);
					await page.getByTestId('checkout-terminal-retry').click();
					await connect(page, 'sim-approve');
					await take(page, orderId);
				}
				if (capture) {
					const response = await capture;
					expect(response.status()).toBeLessThan(400);
					const sent = response.request().postDataJSON();
					expect(sent.context).toMatchObject({
						provider_refs: { payment_intent: expect.stringMatching(/^sim_pi_/) },
						receipt: { brand: 'visa', last4: '4242' },
						transport: 'bluetooth',
					});
					if (scenario === 'tip')
						expect(Math.round(Number(sent.context.amount) * 100)).toBe(
							amount + Math.round(amount / 10)
						);
				}
				await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({ timeout: 60000 });
				const server = await pollOrder(
					request,
					testInfo,
					authorization,
					orderId,
					(order) => ledgerRows(order).some((row) => row.status === 'captured'),
					'device capture must be confirmed on the server ledger'
				);
				const rows = ledgerRows(server);
				expect(rows).toHaveLength(scenario === 'decline' ? 2 : 1);
				expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
				const captured = rows.find((row) => row.status === 'captured')!;
				expect(captured).toMatchObject({
					status: 'captured',
					capture_mode: 'device',
					method_id: device!.id,
					provider_refs: { payment_intent: `sim_pi_${captured.id}` },
					receipt: { brand: 'visa', last4: '4242' },
				});
				if (scenario === 'tip')
					expect(Number((captured as { tip?: string }).tip)).toBeGreaterThan(0);
				expectOrderPaid(server);
			}
		);
	}
});
