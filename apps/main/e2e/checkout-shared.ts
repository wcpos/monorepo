import { type APIRequestContext, expect, type Page, type TestInfo } from '@playwright/test';

import { tryAddRunPrivateSimpleProduct } from './checkout-probe';
import { getStoreUrl, wcposRestRoute } from './fixtures';
import {
	createPushOrdersResponseMatcher,
	liveOrderTest as liveTest,
	newRunLabel,
	orderIdFromPaymentFrame,
	readCartMoney,
	readOrder,
	type ServerOrder,
	stampRunLabel,
	type TrackedOrder,
} from './order-lifecycle';
import {
	resolveProbeAuthorization,
	type StoreAuthorization,
	storeRequestOptions,
} from './probe-credential';

export function digitsOf(value: string): string {
	return value.replace(/\D/g, '');
}

export async function readAmountMinor(page: Page, testId: string): Promise<number> {
	const text = (await page.getByTestId(testId).textContent()) ?? '';
	const digits = digitsOf(text);
	expect(digits, `${testId} must render an amount, got "${text}"`).not.toBe('');
	return Number(digits);
}

export interface Descriptor {
	id: string;
	title?: string;
	kind?: string;
	pos_enabled?: boolean;
	capture?: { mode?: string };
}

export async function fetchDescriptors(
	request: APIRequestContext,
	testInfo: TestInfo,
	authorization: StoreAuthorization
): Promise<Descriptor[] | null> {
	const base = getStoreUrl(testInfo).replace(/\/+$/, '');
	const route = '/wcpos/v2/payment-methods';
	const { headers, params } = storeRequestOptions(authorization);

	// Pretty permalinks first, then the plain `?rest_route=` spelling (store-agnostic policy).
	let response = await request.get(`${base}/wp-json${route}`, {
		headers,
		params,
		failOnStatusCode: false,
	});
	if (response.status() === 404) {
		response = await request.get(`${base}/index.php`, {
			headers,
			params: { ...params, rest_route: route },
			failOnStatusCode: false,
		});
	}
	if (response.status() === 404) return null;
	expect(response.status(), `${route} must answer or 404, not error`).toBeLessThan(400);

	const body = (await response.json()) as { schema?: number; methods?: Descriptor[] };
	expect(body?.schema, `${route} must serve payments contract schema 1`).toBe(1);
	expect(Array.isArray(body?.methods), `${route} must carry a methods array`).toBe(true);
	return body.methods ?? [];
}

export async function requireTenderCheckout(
	request: APIRequestContext,
	testInfo: TestInfo,
	storeAuthorization: () => StoreAuthorization | null,
	mode: 'tender' | 'legacy'
): Promise<{ authorization: StoreAuthorization; descriptors: Descriptor[] }> {
	const authorization = await resolveProbeAuthorization(
		request,
		getStoreUrl(testInfo),
		storeAuthorization,
		{ route: '/wcpos/v2/orders' }
	);
	const descriptors = await fetchDescriptors(request, testInfo, authorization);
	liveTest.skip(descriptors === null, 'store does not serve the payments contract');
	expect(mode, 'a store serving the payments contract must render the tender checkout').toBe(
		'tender'
	);
	return { authorization, descriptors: descriptors! };
}

type PaymentWrite = 'record' | 'void';

function createPaymentResponseMatcher(orderId: number, write: PaymentWrite) {
	let sawUnauthorized = false;
	return (response: {
		url: () => string;
		request: () => { method: () => string };
		status: () => number;
	}) => {
		if (response.request().method() !== 'POST') return false;
		const route = wcposRestRoute(response.url());
		const base = `/wcpos/v2/orders/${orderId}/payments`;
		const matches =
			write === 'record' ? route === base : new RegExp(`^${base}/[^/]+/void$`).test(route ?? '');
		if (!matches || response.status() !== 401) return matches;
		if (sawUnauthorized) return true;
		sawUnauthorized = true;
		return false;
	};
}

export async function clickAndExpectPaymentWrite(
	page: Page,
	testId: string,
	orderId: number,
	write: PaymentWrite
): Promise<void> {
	const pending = page.waitForResponse(createPaymentResponseMatcher(orderId, write), {
		timeout: 90_000,
	});
	pending.catch(() => {});
	await page.getByTestId(testId).click();
	const response = await pending;
	expect(response.status(), `${write} payment POST must succeed`).toBeLessThan(400);
}

interface LedgerRow {
	id?: string;
	method_id?: string;
	kind?: string;
	amount?: string;
	status?: string;
}

export function ledgerRows(order: ServerOrder): LedgerRow[] {
	const parse = (value: unknown): unknown => {
		if (typeof value !== 'string') return value;
		try {
			return JSON.parse(value) as unknown;
		} catch {
			return null;
		}
	};
	const meta = (order.meta_data as { key?: string; value?: unknown }[] | undefined)?.find(
		({ key }) => key === '_wcpos_payments'
	)?.value;
	for (const candidate of [meta, order._wcpos_payments, order.payments, order.ledger]) {
		const parsed = parse(candidate);
		if (Array.isArray(parsed)) return parsed as LedgerRow[];
		const payments = (parsed as { payments?: unknown } | null)?.payments;
		if (Array.isArray(payments)) return payments as LedgerRow[];
	}
	return [];
}

export async function pollOrder(
	request: APIRequestContext,
	testInfo: TestInfo,
	authorization: StoreAuthorization,
	orderId: number,
	check: (order: ServerOrder) => boolean,
	message: string
): Promise<ServerOrder> {
	const seen: { order: ServerOrder | null } = { order: null };
	await expect
		.poll(
			async () => {
				seen.order = await readOrder(request, testInfo, authorization, orderId);
				return check(seen.order);
			},
			{ timeout: 90_000, intervals: [1_000, 2_000, 3_000, 5_000], message }
		)
		.toBe(true);
	return seen.order!;
}

export async function openCheckout(
	page: Page,
	onOrderCreated: (order: TrackedOrder) => void
): Promise<{ orderId: number; uuid: string; mode: 'tender' | 'legacy' }> {
	const saved = page.waitForResponse(createPushOrdersResponseMatcher(), { timeout: 90_000 });
	// An unhandled rejection here takes down the whole worker process (#997).
	saved.catch(() => {});

	await page.getByTestId('checkout-button').click();

	const response = await saved;
	const uuid = (response.request().postDataJSON()?.recordId ?? '') as string;
	if (response.status() >= 400) {
		throw new Error(
			`Order save failed: POST push/orders -> HTTP ${response.status()}. ` +
				`The app stays on the cart when the save fails, so no checkout will open.`
		);
	}
	const ack = (await response.json().catch(() => null)) as { document?: { id?: number } } | null;
	let orderId = Number(ack?.document?.id ?? 0);
	// Register before any wait that can fail: the order exists on the server from here on.
	if (orderId > 0) onOrderCreated({ id: orderId, uuid });

	// Tender checkout swaps into the products column; legacy stores still open a modal.
	// Neither container appearing is a failure, not a missing-contract skip.
	const tender = page.getByTestId('checkout-tender-pane');
	const legacy = page.getByTestId('checkout-dialog');
	await expect(tender.or(legacy).filter({ visible: true }).first()).toBeVisible({
		timeout: 60_000,
	});
	const mode = (await tender.isVisible()) ? 'tender' : 'legacy';

	if (orderId <= 0) {
		if (mode === 'tender') {
			await expect
				.poll(
					async () =>
						Number((await page.getByTestId('checkout-server-order-id').textContent()) ?? 0),
					{
						timeout: 30_000,
						message: 'the tender checkout must expose its server-assigned order id',
					}
				)
				.toBeGreaterThan(0);
			orderId = Number((await page.getByTestId('checkout-server-order-id').textContent()) ?? 0);
		} else {
			orderId = await orderIdFromPaymentFrame(page);
		}
		expect(orderId, 'server-assigned order id (push ack had none)').toBeGreaterThan(0);
		onOrderCreated({ id: orderId, uuid });
	}
	return { orderId, uuid, mode };
}

export async function newOrderAtCheckout(
	page: Page,
	trackOrder: (order: TrackedOrder) => void
): Promise<{ orderId: number; uuid: string; mode: 'tender' | 'legacy'; cartTotal: string }> {
	const added = await tryAddRunPrivateSimpleProduct(page);
	liveTest.skip(!added, 'product-writer credentials are unavailable');
	const label = newRunLabel();
	await stampRunLabel(page, label);
	const { total: cartTotal } = await readCartMoney(page);
	const { orderId, uuid, mode } = await openCheckout(page, (order) =>
		trackOrder({ ...order, label })
	);
	return { orderId, uuid, mode, cartTotal };
}
