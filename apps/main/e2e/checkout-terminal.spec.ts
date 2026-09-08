import { expect, type Page, type Request } from '@playwright/test';

import copy from '../../../packages/core/src/contexts/translations/locales/en/core.json';
import { addCheckoutProbeProductAgain } from './checkout-probe';
import {
	clickAndExpectPaymentWrite,
	type Descriptor,
	ledgerRows,
	newOrderAtCheckout,
	openCheckout,
	pollOrder,
	readAmountMinor,
	requireTenderCheckout,
} from './checkout-shared';
import { getStoreVariant, wcposRestRoute } from './fixtures';
import {
	expectOrderPaid,
	liveOrderTest as liveTest,
	newRunLabel,
	readCartMoney,
	readOrder,
	stampRunLabel,
} from './order-lifecycle';

function simulatedTerminal(descriptors: Descriptor[]): Descriptor | null {
	return (
		descriptors.find((method) => {
			const capture = method.capture as { mode?: string; provider?: string } | undefined;
			return method.pos_enabled && capture?.mode === 'server' && capture.provider === 'simulated';
		}) ?? null
	);
}

function terminalRoute(request: Request, orderId: number, action: string): boolean {
	return (
		request.method() === (action === 'status' ? 'GET' : 'POST') &&
		new RegExp(`^/wcpos/v2/orders/${orderId}/payments/[^/]+/${action}$`).test(
			wcposRestRoute(request.url()) ?? ''
		)
	);
}

function terminalResponse(page: Page, orderId: number, action: 'intent' | 'status' | 'void') {
	const pending = page.waitForResponse(
		(response) => terminalRoute(response.request(), orderId, action),
		{ timeout: 90_000 }
	);
	// Match the existing write helper: a UI failure must not leave an unhandled rejection.
	pending.catch(() => {});
	return pending;
}

async function takeTerminal(page: Page, orderId: number, reader: string): Promise<void> {
	const intent = terminalResponse(page, orderId, 'intent');
	await page.getByTestId('checkout-take-payment').click();
	const response = await intent;
	expect(response.status(), 'intent payment POST must succeed').toBeLessThan(400);
	expect(response.request().postDataJSON()).toMatchObject({ context: { reader } });
	await expect(page.getByTestId('checkout-terminal-leg')).toBeVisible({ timeout: 30_000 });
}

async function expectReceipt(page: Page): Promise<void> {
	await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({ timeout: 60_000 });
	await expect(page.getByTestId('receipt-paid-banner')).toBeVisible();
}

liveTest.describe('POS terminal (server capture-mode) checkout (live store)', () => {
	// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
	liveTest.beforeEach(async ({}, testInfo) => {
		liveTest.skip(getStoreVariant(testInfo) !== 'pro', 'terminal checkout smoke runs on Pro');
	});

	liveTest(
		'approves and closes the leg',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const { orderId, mode } = await newOrderAtCheckout(page, trackOrder);
			const { authorization, descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);
			const terminal = simulatedTerminal(descriptors);
			liveTest.skip(!terminal, 'store has no simulated terminal provider');
			const balance = await readAmountMinor(page, 'checkout-balance');
			await page.getByTestId(`checkout-tile-${terminal!.id}`).click();
			await expect(page.getByTestId('checkout-keypad')).toBeVisible({ timeout: 15_000 });
			await expect(page.getByTestId('checkout-reader-sim-approve')).toBeVisible();
			// Reader selection is rendered by Button's default (primary) variant, not aria-selected.
			await expect(page.getByTestId('checkout-reader-sim-approve')).toHaveClass(/\bbg-primary\b/);
			await expect(page.getByTestId('checkout-take-payment')).toBeEnabled();
			await expect
				.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
				.toBe(balance);
			const status = terminalResponse(page, orderId, 'status');
			await takeTerminal(page, orderId, 'sim-approve');
			await expect(page.getByTestId('checkout-terminal-status')).toHaveText(
				copy['pos_checkout.waiting_for_terminal']
			);
			expect((await status).status(), 'terminal status GET must succeed').toBeLessThan(400);
			await expectReceipt(page);
			const server = await pollOrder(
				request,
				testInfo,
				authorization,
				orderId,
				(order) => {
					const rows = ledgerRows(order);
					return rows.length === 1 && rows[0].status === 'captured';
				},
				'the terminal must capture exactly one leg'
			);
			const [row] = ledgerRows(server);
			expect(row).toMatchObject({
				status: 'captured',
				method_id: terminal!.id,
				provider_refs: { charge: expect.stringMatching(/\S/) },
			});
			expect(Number(row.amount)).toBeCloseTo(Number(server.total), 2);
			expectOrderPaid(server);
		}
	);

	liveTest(
		'declines, then retries as a NEW row',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const { orderId, mode } = await newOrderAtCheckout(page, trackOrder);
			const { authorization, descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);
			const terminal = simulatedTerminal(descriptors);
			liveTest.skip(!terminal, 'store has no simulated terminal provider');
			const balance = await readAmountMinor(page, 'checkout-balance');
			await page.getByTestId(`checkout-tile-${terminal!.id}`).click();
			await page.getByTestId('checkout-reader-sim-decline').click();
			await takeTerminal(page, orderId, 'sim-decline');
			await expect(page.getByTestId('checkout-terminal-status')).toContainText(
				copy['pos_checkout.reason_card_declined'],
				{ timeout: 60_000 }
			);
			await expect(page.getByTestId('checkout-terminal-retry')).toBeVisible();
			await expect(page.getByTestId('checkout-terminal-another')).toBeVisible();
			await page.getByTestId('checkout-terminal-retry').click();
			await expect(page.getByTestId('checkout-keypad')).toBeVisible({ timeout: 15_000 });
			await expect
				.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
				.toBe(balance);
			await expect(page.getByTestId('checkout-reader-sim-decline')).toHaveClass(/\bbg-primary\b/);
			await page.getByTestId('checkout-reader-sim-approve').click();
			await takeTerminal(page, orderId, 'sim-approve');
			await expectReceipt(page);
			const server = await pollOrder(
				request,
				testInfo,
				authorization,
				orderId,
				(order) => {
					const rows = ledgerRows(order);
					return rows.length === 2 && rows.some((row) => row.status === 'captured');
				},
				'retry must create a second payment row'
			);
			const rows = ledgerRows(server);
			expect(rows).toHaveLength(2);
			const failed = rows.find((row) => row.status === 'failed');
			const captured = rows.find((row) => row.status === 'captured');
			expect(failed).toMatchObject({
				id: expect.any(String),
				failure_reason: 'card_declined',
				method_id: terminal!.id,
			});
			expect(captured).toMatchObject({ id: expect.any(String), method_id: terminal!.id });
			expect(failed!.id).not.toBe(captured!.id);
			expectOrderPaid(server);
		}
	);

	liveTest(
		'cancel is a request; a late capture wins',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const { orderId, mode } = await newOrderAtCheckout(page, trackOrder);
			const { authorization, descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);
			const terminal = simulatedTerminal(descriptors);
			liveTest.skip(!terminal, 'store has no simulated terminal provider');
			await page.getByTestId(`checkout-tile-${terminal!.id}`).click();
			await page.getByTestId('checkout-reader-sim-late-capture').click();
			await takeTerminal(page, orderId, 'sim-late-capture');
			await clickAndExpectPaymentWrite(page, 'checkout-terminal-cancel', orderId, 'void');
			await expect(page.getByTestId('checkout-terminal-status')).toHaveText(
				copy['pos_checkout.terminal_cancel_waiting']
			);
			await expectReceipt(page);
			const server = await pollOrder(
				request,
				testInfo,
				authorization,
				orderId,
				(order) => {
					const rows = ledgerRows(order);
					return rows.length === 1 && rows[0].status === 'captured';
				},
				'late capture must win over the cancel request'
			);
			expect(ledgerRows(server)).toHaveLength(1);
			expect(ledgerRows(server)[0].status).toBe('captured');
			expectOrderPaid(server);
		}
	);

	liveTest(
		'deadline voids the leg',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const { orderId, mode } = await newOrderAtCheckout(page, trackOrder);
			const { authorization, descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);
			const terminal = simulatedTerminal(descriptors);
			liveTest.skip(!terminal, 'store has no simulated terminal provider');
			const balance = await readAmountMinor(page, 'checkout-balance');
			await page.getByTestId(`checkout-tile-${terminal!.id}`).click();
			await page.getByTestId('checkout-reader-sim-expire').click();
			const voided = terminalResponse(page, orderId, 'void');
			await takeTerminal(page, orderId, 'sim-expire');
			await expect(page.getByTestId('checkout-terminal-status')).toHaveText(
				copy['pos_checkout.payment_cancelled_on_terminal'],
				{ timeout: 90_000 }
			);
			expect((await voided).status(), 'deadline void POST must succeed').toBeLessThan(400);
			await expect(page.getByTestId('checkout-terminal-retry')).toBeVisible();
			await expect(page.getByTestId('checkout-terminal-another')).toBeVisible();
			await page.getByTestId('checkout-terminal-another').click();
			await expect(page.getByTestId(`checkout-tile-${terminal!.id}`)).toBeVisible();
			await expect
				.poll(() => readAmountMinor(page, 'checkout-balance'), { timeout: 30_000 })
				.toBe(balance);
			const server = await pollOrder(
				request,
				testInfo,
				authorization,
				orderId,
				(order) => {
					const rows = ledgerRows(order);
					return rows.length === 1 && rows[0].status === 'voided';
				},
				'the deadline must void the only leg'
			);
			expect(ledgerRows(server)).toHaveLength(1);
			expect(ledgerRows(server)[0].status).toBe('voided');
			expect(['pos-open', 'pending']).toContain(String(server.status ?? '').replace(/^wc-/, ''));
			expect(server.date_paid ?? server.date_paid_gmt).toBeFalsy();
		}
	);

	liveTest(
		'leaving and reopening resumes the same leg — no second intent',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const intents: Request[] = [];
			// Register before creating the order, so the count covers its entire lifetime in this test.
			page.on('request', (sent) => intents.push(sent));
			const { orderId, uuid, mode } = await newOrderAtCheckout(page, trackOrder);
			const { authorization, descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);
			const terminal = simulatedTerminal(descriptors);
			liveTest.skip(!terminal, 'store has no simulated terminal provider');
			await page.getByTestId(`checkout-tile-${terminal!.id}`).click();
			const amount = (await page.getByTestId('checkout-entry').textContent())!;
			await page.getByTestId('checkout-reader-sim-slow').click();
			await takeTerminal(page, orderId, 'sim-slow');
			// Leaving mid-leg on the wide layout is switching tabs: the checkout column
			// stays the order's stage while its row is live, and the leg polls from the
			// service. Chips only render on inactive tabs; this empty draft is never saved.
			await page.getByTestId('new-order-tab').click();
			await expect(page.getByTestId('checkout-tender-pane')).toBeHidden({ timeout: 30_000 });
			await expect(page.getByTestId(`open-order-chip-${uuid}`)).toHaveText(
				copy['pos_checkout.chip_waiting_for_terminal'].replace('{amount}', amount)
			);
			await page.getByTestId(`open-order-tab-${uuid}`).click();
			await page.getByTestId('checkout-button').click();
			await expect(page.getByTestId('checkout-terminal-leg')).toBeVisible({ timeout: 30_000 });
			await expect(page.getByTestId('checkout-terminal-cancel')).toBeVisible();
			expect(intents.filter((sent) => terminalRoute(sent, orderId, 'intent'))).toHaveLength(1);
			await clickAndExpectPaymentWrite(page, 'checkout-terminal-cancel', orderId, 'void');
			await expect(page.getByTestId('checkout-terminal-status')).toHaveText(
				copy['pos_checkout.payment_cancelled_on_terminal'],
				{ timeout: 60_000 }
			);
			const server = await pollOrder(
				request,
				testInfo,
				authorization,
				orderId,
				(order) => {
					const rows = ledgerRows(order);
					return rows.length === 1 && rows[0].status === 'voided';
				},
				'resumed cancellation must void the same leg'
			);
			expect(ledgerRows(server)).toHaveLength(1);
			expect(ledgerRows(server)[0].status).toBe('voided');
			expect(intents.filter((sent) => terminalRoute(sent, orderId, 'intent'))).toHaveLength(1);
		}
	);

	liveTest(
		'a reader held by another order is disabled with the reason',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const orderA = await newOrderAtCheckout(page, trackOrder);
			const { authorization, descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				orderA.mode
			);
			const terminal = simulatedTerminal(descriptors);
			liveTest.skip(!terminal, 'store has no simulated terminal provider');
			const serverA = await readOrder(request, testInfo, authorization, orderA.orderId);
			expect(
				serverA.number,
				'use the store-assigned order number in the reader reason'
			).toBeTruthy();
			await page.getByTestId(`checkout-tile-${terminal!.id}`).click();
			await page.getByTestId('checkout-reader-sim-stuck').click();
			await takeTerminal(page, orderA.orderId, 'sim-stuck');
			await page.getByTestId('new-order-tab').click();
			await addCheckoutProbeProductAgain(page);
			const labelB = newRunLabel();
			await stampRunLabel(page, labelB);
			await readCartMoney(page);
			const orderB = await openCheckout(page, (order) => trackOrder({ ...order, label: labelB }));
			expect(orderB.mode).toBe('tender');
			expect(orderB.uuid).not.toBe(orderA.uuid);
			await page.getByTestId(`checkout-tile-${terminal!.id}`).click();
			await expect(page.getByTestId('checkout-reader-sim-stuck')).toBeDisabled();
			// The reason is a sibling of the reader button; the keypad owns the complete sentence.
			await expect(page.getByTestId('checkout-keypad')).toContainText(
				copy['pos_checkout.reader_in_use'].replace('{number}', String(serverA.number))
			);
			await expect(page.getByTestId('checkout-reader-sim-approve')).toBeEnabled();
			await page.getByTestId(`open-order-tab-${orderA.uuid}`).click();
			await expect(page.getByTestId('checkout-server-order-id')).toHaveText(String(orderA.orderId));
			await expect(page.getByTestId('checkout-terminal-leg')).toBeVisible({ timeout: 30_000 });
			await clickAndExpectPaymentWrite(page, 'checkout-terminal-cancel', orderA.orderId, 'void');
			await expect(page.getByTestId('checkout-terminal-release')).toBeVisible({ timeout: 60_000 });
			await page.getByTestId('checkout-terminal-release').click();
			await expect(page.getByTestId('checkout-terminal-status')).toHaveText(
				copy['pos_checkout.payment_released']
			);
			await page.getByTestId('checkout-terminal-another').click();
			await expect(page.getByTestId(`checkout-tile-${terminal!.id}`)).toBeVisible();
		}
	);
});
