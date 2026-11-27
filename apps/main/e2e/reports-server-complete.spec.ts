import { type APIRequestContext, type APIResponse, expect, type Locator } from '@playwright/test';

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
import { resolveProbeAuthorization } from './probe-credential';
import {
	productWriterAuthorization,
	renewProductWriterIfExpiring,
	type WriterAuthorization,
} from './search-probe';
import { storeApi } from './store-api';

/** How long the hero total must hold still, with no download line, to be the baseline. */
const MOUNT_SETTLE_MS = 10_000;

/** The bound on the mount read settling: pages still landing keep the poll going. */
const MOUNT_SETTLE_TIMEOUT_MS = 60_000;

/**
 * One 60 s Reports pass (`REPORTS_REFRESH_MS` in use-reports-refresh.ts) plus 30 s for the
 * request round trip and the re-render. The edit can land just after a pass, so the wait is a
 * full period.
 */
const REFRESH_TIMEOUT_MS = 60_000 + 30_000;

/**
 * TIMEOUT ARITHMETIC. `test.setTimeout()` in the body re-sizes the whole budget without
 * refunding fixture time already spent, so every term is counted:
 *  - fixture (120 s): `posPage` hydration and the run-private product, as order-server-edit
 *  - checkout (300 s): product add + label 60, order save + route + surface 120, store payment
 *    frame + payment + leaving checkout 120
 *  - reports screen (90 s): receipt dismissal 30, drawer navigation 12, hero total visible 45,
 *    rounded up
 *  - the mount read's settle (60 s, MOUNT_SETTLE_TIMEOUT_MS): no download line and one total
 *    held across MOUNT_SETTLE_MS, polled until it holds
 *  - store API (60 s): writer login, read-back, two status PUTs, each request-bounded
 *  - one Reports pass (the completion)
 *  - teardown (30 s): the writer's label read and trash (or cancel) in the `finally`
 */
const TEST_TIMEOUT_MS =
	120_000 + 300_000 + 90_000 + MOUNT_SETTLE_TIMEOUT_MS + 60_000 + REFRESH_TIMEOUT_MS + 30_000;

/** The JSON record, unwrapped from the document/record/data envelopes; null on a refusal. */
async function recordOf(response: APIResponse): Promise<Record<string, unknown> | null> {
	if (!response.ok()) return null;
	const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body !== 'object') return null;
	const envelope = ['document', 'record', 'data']
		.map((key) => body[key])
		.find((value) => value && typeof value === 'object' && !Array.isArray(value));
	return (envelope as Record<string, unknown> | undefined) ?? body;
}

/** PUT the order's status as the writer and require the store to apply it. */
async function putStatus(
	request: APIRequestContext,
	storeUrl: string,
	writer: WriterAuthorization,
	id: number,
	status: string
): Promise<void> {
	await renewProductWriterIfExpiring(request, storeUrl, writer);
	const route = `/wc/v3/orders/${id}`;
	const response = await storeApi(request, storeUrl, writer, 'put', route, { status });
	expect(response.status(), `PUT ${route} status must succeed`).toBeLessThan(400);
	const order = await recordOf(response);
	expect(String(order?.status ?? ''), `the store must apply "${status}"`).toBe(status);
}

/**
 * The hero total as a number in any locale: `1.234,56` and `1,234.56` read alike. The last `.`
 * or `,` followed by exactly the final 1 or 2 digits is the decimal mark; every other one is a
 * thousands separator. Throws on text with no digit, so a poll keeps going rather than reading 0.
 */
async function heroTotal(hero: Locator): Promise<number> {
	const text = (await hero.textContent()) ?? '';
	if (!/\d/.test(text)) throw new Error(`the hero total holds no digit yet: "${text}"`);
	const kept = text.replace(/[^0-9.,-]/g, '');
	const mark = /[.,](\d{1,2})$/.exec(kept);
	const whole = (mark ? kept.slice(0, mark.index) : kept).replace(/[.,]/g, '');
	return Number(mark ? `${whole}.${mark[1]}` : whole);
}

/**
 * Trash the order as the writer, falling back to `cancelled`, as order-server-edit does.
 * Prints the id first and never throws; touches the order only while it carries this run's
 * label.
 */
async function trashAsWriter(
	request: APIRequestContext,
	storeUrl: string,
	writer: WriterAuthorization,
	id: number,
	label: string
): Promise<void> {
	console.log(`[e2e-cleanup] reports-server-complete created order ${id} (${label})`);
	try {
		await renewProductWriterIfExpiring(request, storeUrl, writer);
		const route = `/wc/v3/orders/${id}`;
		const current = await recordOf(await storeApi(request, storeUrl, writer, 'get', route));
		if (String(current?.customer_note ?? '') !== label) {
			console.warn(`[e2e-cleanup] SKIPPING order ${id}: label not verified; prune by hand`);
			return;
		}
		const trashed = await storeApi(request, storeUrl, writer, 'delete', route);
		if ((await recordOf(trashed))?.status === 'trash') {
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
 * An order completed outside the POS reaches the open Reports total. Reports does not count
 * on-hold, so the order is parked there before the baseline is read and completed over wc/v3
 * after it; the held screen must pick the order up with no navigation, reload or control.
 * The store is shared with parallel runs, so the assertion is a delta, never an absolute.
 */
test('an order completed on the server reaches the open Reports total', async ({
	posPage: page,
	request,
	storeAuthorization,
	trackOrder,
}, testInfo) => {
	test.skip(getStoreVariant(testInfo) !== 'pro', 'Reports page requires Pro');
	test.setTimeout(TEST_TIMEOUT_MS);
	const storeUrl = getStoreUrl(testInfo);

	// Before the order exists, so a run without the writer leaves no litter.
	const writer = await productWriterAuthorization(request, storeUrl);
	if (!writer) {
		test.skip(true, 'Server-side order edits need the E2E product-writer (wc/v3) credentials');
		return;
	}

	// 1. A labelled, paid order, created through the POS UI.
	const label = newRunLabel();
	await addCheckoutProbeProduct(page);
	await stampRunLabel(page, label);
	const { orderId } = await openCheckout(page, {
		onOrderCreated: (order) => trackOrder({ ...order, label }),
	});
	await processPayment(page);
	const probeAuthorization = await resolveProbeAuthorization(
		request,
		storeUrl,
		storeAuthorization,
		{ route: '/wcpos/v2/orders' }
	);
	const created = await readOrder(request, testInfo, probeAuthorization, orderId);
	// IDENTITY FIRST: the store is shared, so nothing below may touch another order.
	expect(created.customer_note, 'readback must be the order this test created').toBe(label);
	expect(Number(created.id ?? created.order_id)).toBe(orderId);
	const orderTotal = Number(created.total);
	expect(orderTotal, 'the order must carry a positive total').toBeGreaterThan(0);

	try {
		// 2. Parked on-hold, which Reports does not count.
		await putStatus(request, storeUrl, writer, orderId, 'on-hold');
		// The baseline must exclude this order. A queued Reports read can still carry it as paid,
		// so wait for the app to receive the on-hold status before reading the total.
		const onHoldReceived = page.waitForResponse(hasOnHoldOrder, { timeout: 0 }).catch(() => null);
		async function hasOnHoldOrder(response: import('@playwright/test').Response) {
			if (!response.ok() || response.request().method() !== 'GET') return false;
			if (!new URL(response.url()).pathname.endsWith('/wcpos/v2/orders')) return false;
			const rows = (await response.json().catch(() => null))?.data;
			if (!Array.isArray(rows)) return false;
			return rows.some((row) => row?.status === 'on-hold' && Number(row.id) === orderId);
		}

		// 3. The Reports screen and its baseline, once the mount read has settled.
		const dismissReceipt = page
			.getByTestId('receipt-new-sale')
			.or(page.getByTestId('receipt-close-button'))
			.filter({ visible: true })
			.first();
		if (await becomesVisible(dismissReceipt, 30_000)) await dismissReceipt.click();
		await navigateToPage(page, 'reports');
		const screen = page.getByTestId('screen-reports').filter({ visible: true });
		await expect(screen).toBeVisible({ timeout: 30_000 });
		const hero = screen.getByTestId('hero-total').first();
		await expect(hero).toBeVisible({ timeout: 45_000 });
		// A mount walk still landing pages moves the total: the baseline is a total that held
		// still across MOUNT_SETTLE_MS with no download line before or after.
		const progress = screen.getByTestId('reports-sync-progress').filter({ visible: true });
		let baseline = Number.NaN;
		await expect(async () => {
			expect(
				await onHoldReceived,
				'the app must receive the order as on-hold before the baseline'
			).not.toBeNull();
			expect(await progress.count(), 'no Reports download may be in flight').toBe(0);
			const first = await heroTotal(hero);
			await page.waitForTimeout(MOUNT_SETTLE_MS);
			expect(await progress.count(), 'no Reports download may be in flight').toBe(0);
			baseline = await heroTotal(hero);
			expect(baseline, 'the hero total must hold still across the settle').toBe(first);
		}).toPass({ timeout: MOUNT_SETTLE_TIMEOUT_MS });
		expect(Number.isFinite(baseline), 'the hero total must parse as a number').toBe(true);
		console.log(`[reports-server-complete] baseline ${baseline}, order ${orderId} ${orderTotal}`);

		// 4-5. Completed on the server; the held screen must follow within one pass.
		await putStatus(request, storeUrl, writer, orderId, 'completed');
		await expect
			.poll(() => heroTotal(hero), {
				message: 'the completed order must reach the hero total without navigation or sync',
				timeout: REFRESH_TIMEOUT_MS,
			})
			// Half a cent absorbs float error in the sum (0.1 + 0.2 > 0.3), never a missing order.
			.toBeGreaterThanOrEqual(baseline + orderTotal - 0.005);
	} finally {
		// 6. The writer trashes it (or cancels it), guarded by this run's label.
		await trashAsWriter(request, storeUrl, writer, orderId, label);
	}
});
