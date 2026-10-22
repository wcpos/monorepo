import { expect, type Page } from '@playwright/test';

import {
	createPaymentResponseMatcher,
	type Descriptor,
	ledgerRows,
	newOrderAtCheckout,
	pollOrder,
	readAmountMinor,
	requireTenderCheckout,
} from './checkout-shared';
import { wcposRestRoute } from './fixtures';
import { expectOrderPaid, liveOrderTest as liveTest } from './order-lifecycle';

/**
 * How long a reader status line may take to appear. These are waits, not measurements: each
 * one sits behind server round trips (the reader bootstrap; intent, outcome, status and void
 * for a decline), and on the shared pool a single store request took 5-22 s (live run
 * 39782966367). Playwright's 5 s default expect window closed on a slow pool.
 */
const READER_STATUS_WAIT = 60_000;

function simulatedDevice(descriptors: Descriptor[]) {
	return descriptors.find((method) => {
		const capture = method.capture as { mode?: string; provider?: string } | undefined;
		return method.pos_enabled && capture?.mode === 'device' && capture.provider === 'simulated';
	});
}
/**
 * Readers are connected on Settings → Card readers (roadmap#407); the pay sheet only links there.
 * The simulated driver keeps its connection in memory, so the round trip must stay in-app
 * (router navigation, never a reload).
 */
async function connect(page: Page, methodId: string, reader: string) {
	await expect(page.getByTestId('checkout-keypad')).toBeVisible();
	const status = page.getByTestId('checkout-reader-status');
	// The status copy is translated (dev-next runs in Spanish), so read state from test ids and
	// the reader's own name: the settings link renders only while no reader is held, and the
	// line names the simulated reader ("Simulated reader", driver data) only once connected.
	const link = page.getByTestId('checkout-reader-settings-link');
	const readerState = async (): Promise<'link' | 'held' | null> => {
		if (await link.isVisible()) return 'link';
		const line = await status.innerText().catch(() => '');
		return line.includes('Simulated') ? 'held' : null;
	};
	// A remembered reader may still be reconnecting; decide on the settled line.
	let settled: 'link' | 'held' | null = null;
	await expect
		.poll(async () => (settled = await readerState()), { timeout: 15_000 })
		.not.toBeNull();
	const viaLink = settled === 'link';
	if (viaLink) {
		await page.getByTestId('checkout-reader-settings-link').click();
	} else {
		// A reader is already connected, so the sheet shows no link: the drawer route adds two
		// history entries (settings index, then the page).
		await page.getByTestId('drawer-item-settings').click();
		await page.getByTestId('settings-nav-card-readers').click();
	}
	await expect(page.getByTestId('screen-settings-card-readers')).toBeVisible();
	await page.getByTestId('card-readers-connect').click();
	const option = page.getByTestId(`reader-row-${methodId}-connect-${reader}`);
	await expect(option).toBeVisible();
	await option.click();
	// The row's status line renders only while the reader is connected.
	await expect(page.getByTestId(`reader-row-${methodId}-status`)).toBeVisible({
		timeout: READER_STATUS_WAIT,
	});
	await page.goBack();
	if (
		!viaLink &&
		!(await page
			.getByTestId('checkout-keypad')
			.isVisible()
			.catch(() => false))
	)
		await page.goBack();
	await expect(page.getByTestId('checkout-keypad')).toBeVisible();
	await expect(status).toContainText('Simulated');
	await expect(link).toBeHidden();
	await expect(page.getByTestId('checkout-commit')).toBeEnabled();
}
function paymentResponse(page: Page, orderId: number, action: string) {
	// The app re-sends once on a 401; that first answer is not the answer. A 409 always is.
	const response = page.waitForResponse(
		createPaymentResponseMatcher(
			new RegExp(`^/wcpos/v2/orders/${orderId}/payments/[^/]+/${action}$`)
		)
	);
	response.catch(() => {});
	return response;
}
async function take(page: Page, orderId: number) {
	const intent = paymentResponse(page, orderId, 'intent');
	await page.getByTestId('checkout-commit').click();
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
				await page.getByTestId(`checkout-method-${device!.id}`).click();
				const amount = await readAmountMinor(page, 'checkout-entry');
				await connect(page, device!.id, `sim-${scenario}`);
				const capture =
					scenario === 'approve' || scenario === 'tip'
						? paymentResponse(page, orderId, 'capture')
						: null;
				await take(page, orderId);
				if (scenario === 'cancel') {
					await expect(page.getByTestId('checkout-terminal-cancel')).toBeEnabled({
						timeout: READER_STATUS_WAIT,
					});
					const voided = paymentResponse(page, orderId, 'void');
					await page.getByTestId('checkout-terminal-cancel').click();
					expect((await voided).status()).toBeLessThan(400);
				}
				if (scenario === 'decline' || scenario === 'cancel') {
					await expect(page.getByTestId('checkout-terminal-retry')).toBeVisible({
						timeout: READER_STATUS_WAIT,
					});
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
					await connect(page, device!.id, 'sim-approve');
					await take(page, orderId);
				}
				if (capture) {
					const response = await capture;
					if (response.status() >= 400) {
						// The reader's outcome can settle the row on the store before the till's own
						// capture lands (device-leg.ts expects this); the store then refuses the repeat
						// with wcpos_invalid_transition, whose body carries no payment. That refusal is
						// the answer only when the store's ledger shows this same row captured.
						expect(response.status(), 'capture POST must succeed or be a settled repeat').toBe(409);
						expect(((await response.json()) as { code?: string }).code).toBe(
							'wcpos_invalid_transition'
						);
						const paymentId = /\/payments\/([^/]+)\/capture$/
							.exec(wcposRestRoute(response.url()) ?? '')?.[1]
							?.toLowerCase();
						expect(paymentId, 'capture route must name the payment').toBeTruthy();
						await pollOrder(
							request,
							testInfo,
							authorization,
							orderId,
							(order) =>
								ledgerRows(order).some(
									(row) => row.id?.toLowerCase() === paymentId && row.status === 'captured'
								),
							'a refused repeat capture must find the same row already captured'
						);
					}
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
