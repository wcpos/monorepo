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
import {
	resolveProbeAuthorization,
	type StoreAuthorization,
	storeRequestOptions,
} from './probe-credential';
import {
	productWriterAuthorization,
	renewProductWriterIfExpiring,
	type WriterAuthorization,
} from './search-probe';

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
 *  - store API (60 s): writer login, read-backs, label lookup, two PUTs, each request-bounded
 *  - two rendered-row passes (status, then reassignment)
 *  - teardown (30 s): the writer's label read and trash (or cancel) in the `finally`
 */
const TEST_TIMEOUT_MS = 120_000 + 300_000 + 90_000 + 60_000 + 2 * PASS_TIMEOUT_MS + 30_000;

/**
 * A wc/v3 or wp/v2 request under either permalink style: /wp-json/ first, then ?rest_route=
 * on WordPress's 404. Writes tunnel through POST with `_method`, as the app's http client does
 * (WAF and CRS method policies refuse PUT and DELETE). A transport error is rethrown without
 * its message: a query-auth store puts the JWT in the URL.
 */
async function storeApi(
	request: APIRequestContext,
	storeUrl: string,
	authorization: StoreAuthorization,
	method: 'get' | 'put' | 'delete',
	route: string,
	data?: unknown
): Promise<APIResponse> {
	const { headers, params } = storeRequestOptions(authorization);
	const tunnel: Record<string, string> = method === 'get' ? {} : { _method: method.toUpperCase() };
	const send = (url: string, extra: Record<string, string>) =>
		method === 'get'
			? request.get(url, { headers, params: { ...params, ...extra } })
			: request.post(url, { headers, params: { ...params, ...extra, ...tunnel }, data });
	const base = storeUrl.replace(/\/+$/, '');
	try {
		const pretty = await send(`${base}/wp-json${route}`, {});
		if (pretty.status() !== 404) return pretty;
		return await send(`${base}/index.php`, { rest_route: route });
	} catch {
		throw new Error(`${method.toUpperCase()} ${route}: transport error`);
	}
}

/** The JSON body, unwrapped from the document/record/data envelopes a marked request can get. */
async function recordOf(response: APIResponse, what: string): Promise<Record<string, unknown>> {
	if (!response.ok()) throw new Error(`${what} answered HTTP ${response.status()}`);
	const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body !== 'object') throw new Error(`${what} returned no record`);
	const nested = ['document', 'record', 'data'].map((key) => body[key]);
	const envelope = nested.find(
		(value) => value && typeof value === 'object' && !Array.isArray(value)
	);
	return (envelope as Record<string, unknown> | undefined) ?? body;
}

/** The order as wc/v3 reports it; `posUser` is meta `_pos_user`, the cashier the plugin reads. */
async function readWcOrder(
	request: APIRequestContext,
	storeUrl: string,
	writer: StoreAuthorization,
	id: number
) {
	const route = `/wc/v3/orders/${id}`;
	const order = await recordOf(await storeApi(request, storeUrl, writer, 'get', route), route);
	const meta = Array.isArray(order.meta_data)
		? (order.meta_data as { key?: unknown; value?: unknown }[])
		: [];
	const posUser = meta.find((entry) => entry?.key === '_pos_user')?.value;
	return {
		status: String(order.status ?? '').replace(/^wc-/, ''),
		number: String(order.number || id),
		note: String(order.customer_note ?? ''),
		posUser: posUser === undefined || posUser === null || posUser === '' ? null : String(posUser),
	};
}

/**
 * Trash the order as the writer (the POS cashier loses edit rights once it is reassigned),
 * falling back to `cancelled`. Prints the id first and never throws, so teardown cannot mask
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
 * open (no search, navigation, reload or manual sync) the rendered-row pass must bring in
 * (1) a status changed through wc/v3 and (2) a cashier reassignment, which takes the order
 * out of the grid's default `cashier = <signed-in user>` filter (orders/index.tsx).
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
		// 2. The writer's user id, the POS cashier, and the store's label for the new status.
		const before = await readWcOrder(request, storeUrl, writer, orderId);
		expect(before.note, 'the wc/v3 read must be the order this test created').toBe(label);
		const me = await recordOf(
			await storeApi(request, storeUrl, writer, 'get', '/wp/v2/users/me'),
			'/wp/v2/users/me'
		);
		const writerId = String(me.id ?? '');
		expect(writerId, 'the writer must have a user id').toMatch(/^[1-9]\d*$/);
		expect(before.posUser, 'the POS order must carry its cashier (_pos_user)').toBeTruthy();
		expect(writerId, 'reassignment needs a user other than the POS cashier').not.toBe(
			before.posUser
		);
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

		// 6-7. Reassigned to the writer; the order must leave the cashier-filtered grid.
		await renewProductWriterIfExpiring(request, storeUrl, writer);
		await recordOf(
			await storeApi(request, storeUrl, writer, 'put', route, {
				meta_data: [{ key: '_pos_user', value: writerId }],
			}),
			`PUT ${route} _pos_user`
		);
		const after = await readWcOrder(request, storeUrl, writer, orderId);
		expect(after.posUser, 'the store must apply the cashier reassignment').toBe(writerId);
		await expect(
			row,
			'an order reassigned on the server must leave the cashier-filtered grid without a search or sync'
		).toHaveCount(0, { timeout: PASS_TIMEOUT_MS });
	} finally {
		// 8. The writer trashes it: after the reassignment the POS cashier no longer can.
		await trashAsWriter(request, storeUrl, writer, orderId, label);
	}
});
