import { type APIRequestContext, type APIResponse, expect } from '@playwright/test';

import { addCheckoutProbeProduct } from './checkout-probe';
import { becomesVisible, getStoreUrl, getStoreVariant, navigateToPage } from './fixtures';
import {
	newRunLabel,
	openCheckout,
	processPayment,
	readOrder,
	stampRunLabel,
	liveOrderTest as test,
} from './order-lifecycle';
import { resolveProbeAuthorization, type StoreAuthorization } from './probe-credential';
import {
	productWriterAuthorization,
	renewProductWriterIfExpiring,
	type WriterAuthorization,
} from './search-probe';
import { storeApi } from './store-api';

/**
 * One rendered-row pass: the orders screen re-reads its rendered rows with `include=` every
 * 60 s (`RENDERED_ORDER_REFRESH_MS` in use-rendered-order-refresh.ts), plus 45 s for the
 * request round trip and the re-render. An edit can land just after a pass, so the wait is
 * a full period; shrinking it trades a false failure for nothing.
 */
const PASS_TIMEOUT_MS = 60_000 + 45_000;

/**
 * TIMEOUT ARITHMETIC. `test.setTimeout()` in the body re-sizes the whole budget without
 * refunding fixture time already spent, so every term is counted:
 *  - fixture (120 s): `posPage` hydration and the run-private product, as server-created-visibility
 *  - checkout (300 s): product add + label 60, order save + route + surface 120, store payment
 *    frame + payment + leaving checkout 120
 *  - orders screen (90 s): receipt dismissal 30, drawer navigation 12, row visible 45, rounded up
 *  - store API (60 s): writer login, read-back, label lookup, one PUT, each request-bounded
 *  - one rendered-row pass (the status edit)
 *  - teardown (30 s): the writer's label read and trash (or cancel) in the `finally`
 */
const TEST_TIMEOUT_MS = 120_000 + 300_000 + 90_000 + 60_000 + PASS_TIMEOUT_MS + 30_000;

/**
 * The JSON body, unwrapped from the document/record/data envelopes a marked request can get.
 * A refusal names only its WordPress error code: never the message, headers or URL params (a
 * query-auth store puts the JWT in the URL).
 */
async function recordOf(response: APIResponse, what: string): Promise<Record<string, unknown>> {
	if (!response.ok()) {
		const error = (await response.json().catch(() => null)) as { code?: unknown } | null;
		const code =
			error && typeof error === 'object' && typeof error.code === 'string' ? error.code : '';
		throw new Error(`${what} answered HTTP ${response.status()}${code ? ` (${code})` : ''}`);
	}
	const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body !== 'object') throw new Error(`${what} returned no record`);
	const nested = ['document', 'record', 'data'].map((key) => body[key]);
	const envelope = nested.find(
		(value) => value && typeof value === 'object' && !Array.isArray(value)
	);
	return (envelope as Record<string, unknown> | undefined) ?? body;
}

/** The order as wc/v3 reports it. */
async function readWcOrder(
	request: APIRequestContext,
	storeUrl: string,
	writer: StoreAuthorization,
	id: number
) {
	const route = `/wc/v3/orders/${id}`;
	const order = await recordOf(await storeApi(request, storeUrl, writer, 'get', route), route);
	return {
		status: String(order.status ?? '').replace(/^wc-/, ''),
		number: String(order.number || id),
		note: String(order.customer_note ?? ''),
	};
}

/**
 * Trash the order as the writer (a shop manager, who can trash any order), falling back to
 * `cancelled`. Prints the id first and never throws, so teardown cannot mask
 * the verdict; touches the order only while it carries this run's label.
 */
async function trashAsWriter(
	request: APIRequestContext,
	storeUrl: string,
	writer: WriterAuthorization,
	id: number,
	label: string
): Promise<void> {
	console.log(`[e2e-cleanup] order-server-edit created order ${id} (${label})`);
	try {
		await renewProductWriterIfExpiring(request, storeUrl, writer);
		const current = await readWcOrder(request, storeUrl, writer, id).catch(() => null);
		if (current?.note !== label) {
			console.warn(`[e2e-cleanup] SKIPPING order ${id}: label not verified; prune by hand`);
			return;
		}
		const route = `/wc/v3/orders/${id}`;
		const trashed = await storeApi(request, storeUrl, writer, 'delete', route);
		if (trashed.ok() && (await recordOf(trashed, route)).status === 'trash') {
			console.log(`[e2e-cleanup] order ${id} -> trash (writer)`);
			return;
		}
		const cancelled = await storeApi(request, storeUrl, writer, 'put', route, {
			status: 'cancelled',
		});
		console[cancelled.ok() ? 'log' : 'warn'](
			`[e2e-cleanup] order ${id}: trash HTTP ${trashed.status()}, cancel HTTP ${cancelled.status()}`
		);
	} catch {
		console.warn(`[e2e-cleanup] writer teardown of order ${id} threw; prune by hand`);
	}
}

/**
 * Server edits reach an open orders view (#3711, design B). While the orders screen stays
 * open (no search, navigation, reload or manual sync) the rendered-row pass must bring in a
 * status changed through wc/v3. The store refuses a wc/v3 `_pos_user` write (HTTP 403), so the
 * reassignment path is proven by the sync-engine unit test "a reassigned-away order leaves the
 * cashier view after the include= pass".
 */
test('an order edited on the server updates in the open orders view', async ({
	posPage: page,
	request,
	storeAuthorization,
	trackOrder,
}, testInfo) => {
	test.skip(getStoreVariant(testInfo) !== 'pro', 'Orders page requires Pro');
	test.setTimeout(TEST_TIMEOUT_MS);
	const storeUrl = getStoreUrl(testInfo);

	// Before the order exists, so a run without the writer leaves no litter. A configured
	// writer that fails to authenticate throws here.
	const writer = await productWriterAuthorization(request, storeUrl);
	if (!writer) {
		test.skip(true, 'Server-side order edits need the E2E product-writer (wc/v3) credentials');
		return;
	}

	// 1. A labelled, paid order, created through the POS UI.
	const label = newRunLabel();
	await addCheckoutProbeProduct(page);
	await stampRunLabel(page, label);
	const { orderId, uuid } = await openCheckout(page, {
		onOrderCreated: (order) => trackOrder({ ...order, label }),
	});
	await processPayment(page);
	const probeAuthorization = await resolveProbeAuthorization(
		request,
		storeUrl,
		storeAuthorization,
		{
			route: '/wcpos/v2/orders',
		}
	);
	const created = await readOrder(request, testInfo, probeAuthorization, orderId);
	// IDENTITY FIRST: the store is shared, so nothing below may touch another order.
	expect(created.customer_note, 'readback must be the order this test created').toBe(label);
	expect(Number(created.id ?? created.order_id)).toBe(orderId);

	try {
		// 2. The wc/v3 read-back and the store's label for the new status.
		const before = await readWcOrder(request, storeUrl, writer, orderId);
		expect(before.note, 'the wc/v3 read must be the order this test created').toBe(label);
		const target = before.status === 'on-hold' ? 'processing' : 'on-hold';
		// The app renders the store's own label (wc_get_order_statuses): any store language.
		const totals = await storeApi(request, storeUrl, writer, 'get', '/wc/v3/reports/orders/totals');
		expect(totals.ok(), 'the order status labels must be readable').toBe(true);
		const statuses = (await totals.json()) as { slug?: string; name?: string }[];
		const targetLabel = statuses.find((entry) => entry.slug === target)?.name ?? '';
		expect(targetLabel, `the store must name the "${target}" status`).toBeTruthy();

		// 3. The order in the open orders view; the receipt, when shown, is dismissed first.
		const dismissReceipt = page
			.getByTestId('receipt-new-sale')
			.or(page.getByTestId('receipt-close-button'))
			.filter({ visible: true })
			.first();
		if (await becomesVisible(dismissReceipt, 30_000)) await dismissReceipt.click();
		await navigateToPage(page, 'orders');
		const screen = page.getByTestId('screen-orders').filter({ visible: true });
		const row = screen.getByTestId(`order-number-${before.number}`);
		await expect(row.first()).toBeVisible({ timeout: 45_000 });
		const statusCell = screen.getByTestId(`order-status-${uuid}`);
		await expect(statusCell).toBeVisible({ timeout: 15_000 });
		const initialStatus = (await statusCell.textContent())?.trim() ?? '';
		console.log(`[order-server-edit] order ${orderId} renders status "${initialStatus}"`);

		// 4-5. Status changed on the server; the open view must follow within one pass.
		const route = `/wc/v3/orders/${orderId}`;
		await renewProductWriterIfExpiring(request, storeUrl, writer);
		const edited = await recordOf(
			await storeApi(request, storeUrl, writer, 'put', route, { status: target }),
			`PUT ${route} status`
		);
		expect(edited.status, 'the store must apply the status edit').toBe(target);
		await expect(
			statusCell,
			`status "${initialStatus}" -> "${targetLabel}" must render without a search or sync`
		).toHaveText(targetLabel, { timeout: PASS_TIMEOUT_MS });
	} finally {
		// 6. The writer trashes it (or cancels it), guarded by this run's label.
		await trashAsWriter(request, storeUrl, writer, orderId, label);
	}
});
