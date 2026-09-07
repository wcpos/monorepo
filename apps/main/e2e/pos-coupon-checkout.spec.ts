/**
 * Coupon applied, then paid, must clear the open-cart tab — the composition no other spec covers.
 * The client wrote a short coupon discount such as "7.5", while the server ack padded it to
 * "7.500000", making the reconciled order appear locally dirty despite equal money.
 * That false dirty state rejected the paid snapshot and left a paid sale open in the POS.
 */
import { randomUUID } from 'node:crypto';

import {
	type APIRequestContext,
	type ConsoleMessage,
	expect,
	request as playwrightRequest,
} from '@playwright/test';

import { getStoreUrl, getStoreVariant, listStoreIds, storeRequestOptions } from './fixtures';
import {
	isPushOrdersResponse,
	liveOrderTest as liveTest,
	newRunLabel,
	type OrderPayload,
	processPayment,
	readCartMoney,
	readOrder,
	type ServerOrder,
	stampRunLabel,
} from './order-lifecycle';
import { resolveProbeAuthorization } from './probe-credential';
import {
	createSearchProbe,
	deleteSearchProbe,
	mintSearchProbeToken,
	productWriterAuthorization,
	productWriterCredentialsConfigured,
	searchAndWaitForServer,
	type SearchProbe,
} from './search-probe';

async function couponRequest(
	request: APIRequestContext,
	method: 'post' | 'delete',
	storeUrl: string,
	id: number | undefined,
	options: Record<string, unknown>
) {
	const base = storeUrl.replace(/\/+$/, '');
	const path = id === undefined ? 'coupons' : `coupons/${id}`;
	const pretty = await request[method](`${base}/wp-json/wc/v3/${path}`, options);
	if (pretty.status() !== 404) return pretty;
	return request[method](`${base}/?rest_route=/wc/v3/${path}`, options);
}

type CouponProbe = { code: string; id: number; product: SearchProbe };

const couponTest = liveTest.extend<object, { probeCoupon: CouponProbe | null }>({
	probeCoupon: [
		// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
		async ({}, use, workerInfo) => {
			if (!productWriterCredentialsConfigured()) {
				await use(null);
				return;
			}
			const request = await playwrightRequest.newContext();
			const storeUrl =
				process.env.E2E_STORE_URL ||
				(workerInfo.project.use as { storeUrl?: string }).storeUrl ||
				'https://dev-next.wcpos.com';
			let created: CouponProbe | null = null;
			let product: SearchProbe | null = null;
			let writer: Awaited<ReturnType<typeof productWriterAuthorization>> = null;
			let writerAuth: ReturnType<typeof storeRequestOptions> | null = null;
			try {
				writer = await productWriterAuthorization(request, storeUrl);
				if (!writer) throw new Error('Configured coupon writer did not authorize');
				writerAuth = storeRequestOptions(writer);
				// The bug's trigger is a coupon discount whose shortest JS string has fewer than
				// six decimals (the client wrote "7.5", the server acked "7.500000"). A percent
				// coupon discounts the EX-TAX price, so on a tax-inclusive store a taxable 25.00
				// product yields "2.272727" and never trips it. A tax-exempt product has the same
				// price on every store, so 10% of 20.00 is "2" regardless of tax configuration.
				const probe = await createSearchProbe({
					request,
					storeUrl,
					authorization: writer,
					collection: 'products',
					workerIndex: workerInfo.workerIndex,
					writerConfigured: true,
					productData: { tax_status: 'none', regular_price: '20.00' },
				});
				if (!probe.ok) throw new Error(probe.reason);
				product = probe.probe;
				const code =
					`${mintSearchProbeToken(workerInfo.workerIndex)}${randomUUID().slice(0, 4)}`.toLowerCase();
				const response = await couponRequest(request, 'post', storeUrl, undefined, {
					...writerAuth,
					data: {
						code,
						discount_type: 'percent',
						amount: '10',
						description: 'wcpos-e2e coupon checkout probe (safe to delete)',
					},
				});
				if (!response.ok()) {
					throw new Error(`probe coupon create failed: HTTP ${response.status()}`);
				}
				const body = (await response.json()) as { id?: number; code?: string };
				created = { code: body.code ?? code, id: Number(body.id), product };
				expect(created.id, 'probe coupon must have a server id').toBeGreaterThan(0);
				// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API.
				await use(created);
			} finally {
				if (created?.id && writerAuth) {
					await couponRequest(request, 'delete', storeUrl, created.id, {
						...writerAuth,
						params: { ...writerAuth.params, force: 'true' },
					}).catch(() => {});
				}
				if (product && writer) {
					await deleteSearchProbe({
						request,
						storeUrl,
						authorization: writer,
						collection: 'products',
						id: product.id,
					}).catch(() => {});
				}
				await request.dispose();
			}
		},
		{ scope: 'worker' },
	],
});

const storeTargets: (string | null)[] = (() => {
	const ids = listStoreIds('pro');
	return ids.length > 1 ? ids : [null];
})();

for (const targetStoreId of storeTargets) {
	couponTest.describe(
		`POS Cart - coupon checkout (live store${targetStoreId ? ` — store ${targetStoreId}` : ''})`,
		() => {
			if (targetStoreId) couponTest.use({ targetStoreId });
			couponTest(
				'paying a couponed order applies the paid snapshot and clears its cart tab',
				async (
					{ posPage: page, trackOrder, probeCoupon, request, storeAuthorization },
					testInfo
				) => {
					couponTest.skip(getStoreVariant(testInfo) === 'free', 'coupon application is Pro-gated');
					couponTest.skip(
						!probeCoupon,
						'writer credentials not configured (E2E_PRODUCT_WRITER_USER/_PASS) — cannot provision a probe coupon'
					);
					couponTest.slow();
					const consoleLines: string[] = [];
					const captureConsole = (message: ConsoleMessage) => consoleLines.push(message.text());
					page.on('console', captureConsole);
					try {
						const label = newRunLabel();
						// The fixture's own tax-exempt product, found by its run-private token (the
						// same search-then-add path checkout-probe uses for run-private products).
						const product = probeCoupon!.product;
						await searchAndWaitForServer(
							page,
							page.getByTestId('search-products'),
							'products',
							product.token
						);
						const posScreen = page.getByTestId('screen-pos').filter({ visible: true });
						const tile = posScreen.getByTestId(`product-tile-${product.id}`);
						const tableButton = posScreen
							.getByTestId(product.rowTestId ?? `data-table-row-${product.id}`)
							.getByTestId('add-to-cart-button');
						await expect(tile.or(tableButton).first()).toBeVisible({ timeout: 30_000 });
						if (await tile.isVisible()) await tile.click();
						else await tableButton.click();
						await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
						await stampRunLabel(page, label);
						await page.getByTestId('add-cart-item-menu').click();
						await expect(page.getByTestId('menu-add-fee')).toBeVisible({ timeout: 10_000 });
						const menuItem = page.getByTestId('menu-add-coupon');
						couponTest.skip(
							(await menuItem.count()) === 0,
							'Pro coupon capability absent (menu-add-coupon)'
						);
						await menuItem.click();
						await page.getByTestId('add-coupon-combobox').click();
						const search = page.getByTestId('add-coupon-search-input');
						await expect(search).toBeVisible({ timeout: 15_000 });
						await search.fill(probeCoupon!.code);
						const option = page.getByTestId(`add-coupon-option-${probeCoupon!.id}`);
						await expect(option).toBeVisible({ timeout: 60_000 });
						await option.click();
						const submit = page.getByTestId('add-coupon-submit');
						await expect(submit).toBeEnabled({ timeout: 10_000 });
						await submit.click();
						await expect(submit).not.toBeVisible({ timeout: 30_000 });
						const cart = await readCartMoney(page, { discounted: true });
						expect(Number(cart.discountTotal)).toBeGreaterThan(0);

						const saved = page.waitForResponse(isPushOrdersResponse, { timeout: 90_000 });
						saved.catch(() => {}); // Await below still fails; avoid an orphan rejection if click fails.
						await page.getByTestId('checkout-button').click();
						const response = await saved;
						const envelope = (response.request().postDataJSON() ?? {}) as {
							recordId?: string;
							payload?: OrderPayload;
						};
						const sent = envelope.payload ?? {};
						const ack = (await response.json().catch(() => null)) as {
							document?: ServerOrder;
						} | null;
						const orderId = Number(ack?.document?.id);
						if (orderId > 0) trackOrder({ id: orderId, uuid: envelope.recordId, label });
						await testInfo.attach('push-payload.json', {
							body: JSON.stringify(sent, null, 2),
							contentType: 'application/json',
						});
						await testInfo.attach('push-ack.json', {
							body: JSON.stringify(ack, null, 2),
							contentType: 'application/json',
						});
						expect(response.status(), 'couponed checkout save must succeed').toBeLessThan(400);
						expect(orderId, 'ack must identify the created order').toBeGreaterThan(0);
						expect(envelope.recordId, 'push must identify the order uuid').toBeTruthy();
						const coupons = (sent.coupon_lines ?? []) as { code?: string; discount?: string }[];
						expect(coupons.map((coupon) => coupon.code?.toLowerCase())).toEqual([
							probeCoupon!.code,
						]);
						const discount = Number(coupons[0].discount);
						expect(discount, 'the pushed coupon must discount real money').toBeGreaterThan(0);
						// Assert the trigger, not a store-specific price/tax result or six-decimal coincidence.
						expect(String(discount), 'discount must have fewer than six decimals').toMatch(
							/^\d+(?:\.\d{1,5})?$/
						);
						await page.waitForURL((url) => url.pathname === `/cart/${envelope.recordId}/checkout`, {
							timeout: 60_000,
						});
						await expect(page.getByTestId('checkout-dialog')).toBeVisible({ timeout: 30_000 });
						// UUID IDs already exist; shared-store tab counts would include other cashiers' orders.
						const orderTab = page.getByTestId(`open-order-tab-${envelope.recordId}`);
						await expect(orderTab).toBeAttached({ timeout: 30_000 });
						// The cash gateway tenders the full total when the field is left empty, so the
						// shared helper (frame loaded → button enabled → click → checkout route left) is
						// the whole payment.
						await processPayment(page);

						// 1. A paid snapshot must not be rejected as locally dirty.
						expect(
							consoleLines.filter((line) =>
								line.includes('Checkout order snapshot was not applied')
							)
						).toEqual([]);
						// 2. Dismiss an auto-shown receipt so hidden modal background cannot fake tab removal.
						if (new URL(page.url()).pathname.includes('/cart/receipt/')) {
							await page.getByTestId('receipt-close-button').click();
						}
						await expect(page.getByTestId('new-order-tab')).toBeVisible({ timeout: 30_000 });
						await expect(orderTab).not.toBeVisible({ timeout: 30_000 });
						// 3. Read the acked order with readOrder's dp=6, not a stub or another cashier's sale.
						const authorization = await resolveProbeAuthorization(
							request,
							getStoreUrl(testInfo),
							storeAuthorization,
							{ route: '/wcpos/v2/orders' }
						);
						const server = await readOrder(request, testInfo, authorization, orderId);
						expect(Number(server.id ?? server.order_id)).toBe(orderId);
						expect(server.customer_note).toBe(label);
						expect(['completed', 'processing']).toContain(server.status);
						expect(server.date_paid).toEqual(expect.stringMatching(/\S/));
					} finally {
						page.off('console', captureConsole);
						await testInfo.attach('console-lines.json', {
							body: JSON.stringify(consoleLines, null, 2),
							contentType: 'application/json',
						});
					}
				}
			);
		}
	);
}
