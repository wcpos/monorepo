/**
 * Live spec for a cash sale taken while the till is offline (ADR 0040 Decided 1, rules 1–3).
 *
 * WHAT THIS PROVES that the unit suites cannot: with the browser really offline, a manual
 * method that declares `offline: 'record'` is offered as "sent later" (rule 1), the cashier
 * confirms the risk, and the sale completes on the till while the store has NOT heard it
 * (rule 2: journalled, nothing sent). When the link returns the app re-sends the journalled
 * record on its own, and the store adopts it as one captured leg on a paid order (rule 3).
 *
 * Two timing facts shape the cut. `context.setOffline` fires the browser's offline event, which
 * moves the app to `offline` at once; a route abort does not (the online tile stays live for
 * 30–100 s and a commit in that window lands on `checkout-unanswered`). And the re-send is
 * triggered by the online flip itself (`completion-journal-bridge.tsx`), so the spec never
 * retries anything: it reconnects and waits for the app's own POST.
 *
 * Store-agnostic per CLAUDE.md: the order is built through the POS UI from this run's probe
 * product, the cash method comes from the store's own descriptor, and a store whose cash
 * method does not declare `offline: 'record'` SKIPS with that reason.
 */
import {
	type APIRequestContext,
	expect,
	type Page,
	type Request,
	type TestInfo,
} from '@playwright/test';

import {
	createPaymentResponseMatcher,
	type Descriptor,
	expectPaymentAnswer,
	ledgerRows,
	newOrderAtCheckout,
	pollOrder,
	readAmountMinor,
	requireTenderCheckout,
} from './checkout-shared';
import { getStoreVariant, navigateToPage, wcposRestRoute } from './fixtures';
import {
	expectOrderPaid,
	liveOrderTest as liveTest,
	readOrder,
	type TrackedOrder,
} from './order-lifecycle';

import type { StoreAuthorization } from './probe-credential';

/** The payments contract's offline capability (ADR 0040 Decided 1 rule 2). */
type OfflineDescriptor = Descriptor & {
	capabilities?: { offline?: 'none' | 'record' | 'queue' };
};

interface OfflineSale {
	orderId: number;
	uuid: string;
	cashId: string;
	authorization: StoreAuthorization;
}

const UNPAID = new Set(['pos-open', 'pending']);

/**
 * Steps shared by both tests: an order the store already knows (an order it has never seen is
 * never offered an offline tile, `tiles.ts`), the link cut, the cash taken and confirmed, and
 * the evidence that the till completed the sale while the store did not hear it. Leaves the
 * browser OFFLINE; the caller restores it in a `finally`.
 */
async function takeCashSaleOffline(
	page: Page,
	request: APIRequestContext,
	testInfo: TestInfo,
	trackOrder: (order: TrackedOrder) => void,
	storeAuthorization: () => StoreAuthorization | null
): Promise<OfflineSale> {
	const { orderId, uuid, mode } = await newOrderAtCheckout(page, trackOrder);
	const { authorization, descriptors } = await requireTenderCheckout(
		request,
		testInfo,
		storeAuthorization,
		mode
	);
	const cash = (descriptors as OfflineDescriptor[]).find(
		(method) => method.pos_enabled && method.capture?.mode === 'manual' && method.kind === 'cash'
	);
	liveTest.skip(!cash, 'store declares no manual cash method');
	liveTest.skip(
		cash!.capabilities?.offline !== 'record',
		`cash method ${cash!.id} does not declare offline: 'record'`
	);

	await page.context().setOffline(true);
	await expect(page.getByTestId('checkout-offline')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId(`checkout-method-sent-later-${cash!.id}`)).toBeVisible();
	const balance = await readAmountMinor(page, 'checkout-balance');
	await page.getByTestId(`checkout-method-${cash!.id}`).click();
	await expect
		.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
		.toBe(balance);

	// A failed request still emits `request`, so an attempted send while offline is caught too.
	const route = `/wcpos/v2/orders/${orderId}/payments`;
	const sent: string[] = [];
	const record = (req: Request) => {
		if (wcposRestRoute(req.url())?.startsWith(route)) sent.push(`${req.method()} ${req.url()}`);
	};
	page.on('request', record);
	try {
		await page.getByTestId('checkout-commit').click();
		// Rule 1: never unaware — the cashier confirms a sale the store cannot hear yet.
		await expect(page.getByTestId('checkout-offline-dialog')).toBeVisible({ timeout: 15_000 });
		await page.getByTestId('checkout-offline-confirm').click();

		await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({ timeout: 120_000 });
		await expect(page.getByTestId('receipt-awaiting-store')).toBeVisible({ timeout: 15_000 });
		// The disc exposes its awaiting/answered state only through its wash class.
		await expect(page.getByTestId('receipt-paid-disc')).toHaveClass(/\bbg-warning\/15\b/);
		await expect(page.getByTestId('register-bar-pill').filter({ visible: true })).toBeVisible();
		expect(sent, 'rule 2: an offline record is journalled, never sent').toEqual([]);
	} finally {
		page.off('request', record);
	}

	// The test's own request context is outside the browser, so setOffline does not reach it.
	const server = await readOrder(request, testInfo, authorization, orderId);
	expect(ledgerRows(server), 'the store must not have heard the offline sale').toEqual([]);
	expect(
		UNPAID.has(String(server.status ?? '').replace(/^wc-/, '')),
		`the order must still be unpaid on the store, got "${server.status}"`
	).toBe(true);
	expect(server.date_paid ?? server.date_paid_gmt ?? null).toBeFalsy();

	return { orderId, uuid, cashId: cash!.id, authorization };
}

/**
 * Restores the link and waits for the app's own re-send (rule 3). Armed before the flip: the
 * recovery starts on the online event, and a `push/orders` may go out ahead of the payment.
 */
async function reconnectAndExpectResend(page: Page, orderId: number): Promise<void> {
	const resent = page.waitForResponse(
		createPaymentResponseMatcher(new RegExp(`^/wcpos/v2/orders/${orderId}/payments$`)),
		{ timeout: 150_000 }
	);
	// An unhandled rejection here takes down the whole worker process (#997).
	resent.catch(() => {});
	await page.context().setOffline(false);
	await expectPaymentAnswer(await resent, 'the re-sent offline record must be accepted');
}

/** The store adopted the record: one captured cash leg, and the order is paid. */
async function expectStoreAdopted(
	request: APIRequestContext,
	testInfo: TestInfo,
	sale: OfflineSale
): Promise<void> {
	const server = await pollOrder(
		request,
		testInfo,
		sale.authorization,
		sale.orderId,
		(order) => ledgerRows(order).length === 1,
		'the store must record exactly one payment leg once the link returns'
	);
	expectOrderPaid(server);
	const [row] = ledgerRows(server);
	expect(row.method_id, 'the leg must name the cash method that was tapped').toBe(sale.cashId);
	expect(row.status, 'a manual cash leg is captured on the spot').toBe('captured');
	expect(Number(row.amount), 'the leg must equal the order total').toBeCloseTo(
		Number(server.total),
		2
	);
}

/**
 * Waits for the bridge's replay of this sale's completion to have run. The replay has no UI of
 * its own, so its `checkout.completed` audit row is the only order-specific proof it ran. The
 * logger folds identical rows within 60 s into one counted row, and `replayed` is not part of
 * that identity (nor searchable), so the replay shows as a second row OR as one row counted twice.
 */
async function waitForReplayAudit(page: Page, uuid: string): Promise<void> {
	await navigateToPage(page, 'health');
	await page.getByTestId('health-nav-logs').click();
	const logs = page.getByTestId('screen-logs');
	await expect(logs.getByTestId('search-logs')).toBeVisible({ timeout: 30_000 });
	await logs.getByTestId('search-logs').fill(`checkout.completed ${uuid}`); // Indexed log facts.
	await expect
		.poll(async () => Number((await logs.getByTestId('logs-loaded-count').textContent()) ?? 0), {
			timeout: 30_000,
			message: "the till's own completion must be audited",
		})
		.toBeGreaterThanOrEqual(1);
	const rows = logs.getByTestId(/^logs-row-/).filter({ visible: true });
	await expect
		.poll(
			async () => {
				if ((await rows.count()) >= 2) return true;
				// The count renders only in an expanded row, and a click toggles: open it only if closed.
				if ((await logs.getByTestId(/^logs-detail-/).count()) === 0)
					await rows.first().click({ timeout: 10_000 });
				const attempts = logs.getByTestId(/^logs-attempts-/).first();
				return ((await attempts.textContent().catch(() => null)) ?? '').trim() === '2';
			},
			{
				timeout: 150_000, // The replay waits for a pull to adopt the paid document.
				intervals: [1_000, 2_000, 5_000],
				message:
					'the bridge must replay the completion: a second audit row, or one row counted twice',
			}
		)
		.toBe(true);
	await navigateToPage(page, 'pos');
	await expect(page.getByTestId('pos-products-panel').getByTestId('search-products')).toBeVisible({
		timeout: 30_000,
	});
}

liveTest.describe('POS offline cash tender (live store, ADR 0040 Decided 1)', () => {
	// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
	liveTest.beforeEach(async ({}, testInfo) => {
		// Pro only: the free dev store is not guaranteed to carry the payments contract.
		liveTest.skip(getStoreVariant(testInfo) !== 'pro', 'tender checkout runs on Pro');
	});

	liveTest(
		'records a cash sale offline, tells the cashier it awaits the store, and the store adopts it on reconnect',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			try {
				const sale = await takeCashSaleOffline(
					page,
					request,
					testInfo,
					trackOrder,
					storeAuthorization
				);
				await reconnectAndExpectResend(page, sale.orderId);

				// The answer re-pops the disc green on the same receipt (rule 1: the mark goes).
				await expect(page.getByTestId('receipt-awaiting-store')).toBeHidden({ timeout: 60_000 });
				await expect(page.getByTestId('receipt-paid-disc')).toHaveClass(/\bbg-success\/15\b/);
				await expect(page.getByTestId('receipt-paid-banner')).toBeVisible();
				await expectStoreAdopted(request, testInfo, sale);

				await page.getByTestId('receipt-new-sale').click();
				await expect(page.getByTestId('checkout-tender-pane')).toBeHidden({ timeout: 30_000 });

				// An adopted sale is not a refused one: Orders carries no attention row for it.
				await navigateToPage(page, 'orders');
				const screen = page.getByTestId('screen-orders');
				await expect(screen.getByTestId('search-orders')).toBeVisible({ timeout: 30_000 });
				await expect(page.getByTestId('orders-attention')).toHaveCount(0);
			} finally {
				await page.context().setOffline(false);
			}
		}
	);

	liveTest(
		'a cashier who moves on before the link returns still has the sale adopted, with no phantom receipt',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			try {
				const sale = await takeCashSaleOffline(
					page,
					request,
					testInfo,
					trackOrder,
					storeAuthorization
				);
				expect(sale.uuid, 'the checkout push must name the order uuid').not.toBe('');
				const tab = page.getByTestId(`open-order-tab-${sale.uuid}`);
				const chip = page.getByTestId(`open-order-chip-${sale.uuid}`);

				await page.getByTestId('receipt-new-sale').click();
				await expect(page.getByTestId('checkout-tender-pane')).toBeHidden({ timeout: 30_000 });
				await expect(tab).toHaveCount(0);
				await expect(chip).toHaveCount(0);

				await reconnectAndExpectResend(page, sale.orderId);
				await expectStoreAdopted(request, testInfo, sale);
				await waitForReplayAudit(page, sale.uuid);

				// ADR 0040 Built 3: the bridge's second completion is a replay; it refreshes only a
				// receipt tab that still exists and never re-adds one.
				await expect(page.getByTestId('checkout-receipt-stage')).toBeHidden();
				await expect(tab).toHaveCount(0);
				await expect(chip).toHaveCount(0);
			} finally {
				await page.context().setOffline(false);
			}
		}
	);
});
