/**
 * A customer created from the cart while the store is unreachable (#1523).
 *
 * Save must attach the customer to the order at once — no network wait, no
 * failure toast — and once the store is reachable again and the customer's
 * create is acknowledged, the order the store is PAID for must carry that
 * customer's new Woo id (`NewCustomerLinkBridge` stamps it on the order).
 *
 * The path proven is the one a cashier takes: the stamp is an ordinary order
 * update, and while the order is an open cart the open-cart hold keeps it back
 * on purpose, even after the checkout push. It reaches the store with the
 * order push every online payment makes before money moves. So this spec pays
 * in cash and asserts both the ordering (an order push carrying the id was
 * accepted before the payment POST went out) and the paid server order.
 *
 * Store-agnostic per CLAUDE.md: the order is built through the POS UI from
 * this run's private probe product, the customer is minted with a probe token,
 * the cash method comes from the store's own payments descriptor, and the
 * assertion is on THAT customer's id, read back from the store by its probe
 * email. The customer is left behind by design (unique per run).
 */
import { expect, type Page, type Response, type Route } from '@playwright/test';

import { addCheckoutProbeProduct } from './checkout-probe';
import {
	clickAndExpectPaymentWrite,
	openCheckout,
	pollOrder,
	readAmountMinor,
	requireTenderCheckout,
} from './checkout-shared';
import {
	ensureRegisterOpen,
	getStoreUrl,
	getStoreVariant,
	storeRequestOptions,
	wcposRestRoute,
} from './fixtures';
import {
	expectOrderPaid,
	liveOrderTest as liveTest,
	newRunLabel,
	stampRunLabel,
} from './order-lifecycle';
import { mintSearchProbeToken, probeGet } from './search-probe';

const PUSH_CUSTOMERS = '/wcpos/v2/push/customers';
const PUSH_ORDERS = '/wcpos/v2/push/orders';

async function createCustomerFromCart(page: Page, probe: string, email: string): Promise<void> {
	const menuButton = page.getByTestId('add-cart-item-menu');
	await expect(menuButton).toBeVisible({ timeout: 15_000 });
	await menuButton.click();
	const addCustomerMenuItem = page.getByTestId('menu-add-customer');
	await expect(addCustomerMenuItem).toBeEnabled({ timeout: 10_000 });
	await addCustomerMenuItem.click();

	const dialog = page.getByTestId('add-customer-dialog');
	await expect(dialog).toBeVisible({ timeout: 10_000 });
	await dialog.getByTestId('customer-first-name-input').fill(probe);
	await dialog.getByTestId('customer-last-name-input').fill('Probe');
	await dialog.getByTestId('customer-email-input').fill(email);
	await dialog.getByTestId('customer-form-save').click();

	// Well inside the 15 s the old flow spent waiting for a Woo id before it
	// reported failure: the dialog closing here is the attach not waiting.
	await expect(dialog).toBeHidden({ timeout: 5_000 });
}

/** The payload a push envelope carried, or null when the body is not one. */
function pushedPayload(response: Response): Record<string, unknown> | null {
	const envelope = (response.request().postDataJSON() ?? null) as {
		payload?: Record<string, unknown>;
	} | null;
	return envelope?.payload ?? null;
}

liveTest.describe('Cart: new customer while the store is unreachable (#1523)', () => {
	// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
	liveTest.beforeEach(async ({}, testInfo) => {
		liveTest.skip(getStoreVariant(testInfo) !== 'pro', 'Adding customers from cart requires Pro');
	});

	liveTest(
		'attaches the customer at once, and the paid server order carries its id',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			await ensureRegisterOpen(page);
			// The run-private product, or the shared-SKU fallback without writer secrets:
			// the product is only there to give the order a line to check out.
			await addCheckoutProbeProduct(page);

			const probe = mintSearchProbeToken(testInfo.workerIndex);
			const email = `${probe}@example.com`;
			const storeUrl = getStoreUrl(testInfo);
			const storeOrigin = new URL(storeUrl).origin;

			// Only the store goes dark; the app itself is served from the test origin.
			const isStore = (url: URL) => url.origin === storeOrigin;
			const unreachable = (route: Route) => route.abort('internetdisconnected');
			// Armed before the store comes back, so the drain's first retry cannot slip past.
			// An aborted push has no response, so only the accepted one matches.
			const customerAck = page.waitForResponse(
				(response) => {
					if (response.request().method() !== 'POST') return false;
					if (wcposRestRoute(response.url()) !== PUSH_CUSTOMERS) return false;
					const payload = pushedPayload(response);
					const billing = payload?.billing as { email?: unknown } | undefined;
					return payload?.email === email || billing?.email === email;
				},
				{ timeout: 120_000 }
			);
			// An unhandled rejection takes down the whole worker process (#997).
			customerAck.catch(() => {});
			await page.context().route(isStore, unreachable);
			try {
				await createCustomerFromCart(page, probe, email);
				// Read the pill addressed by testID; the probe token is the referent.
				await expect(page.getByTestId('cart-customer-name')).toContainText(probe, {
					timeout: 10_000,
				});
			} finally {
				await page.context().unroute(isStore, unreachable);
			}

			// The store is back: the queued customer create drains and is acknowledged.
			// This is the case the fix promises: the ack lands BEFORE payment.
			expect((await customerAck).status(), 'the customer create must be accepted').toBeLessThan(
				400
			);

			// From here on, record in order every accepted order push and the payment POST.
			const events: ({ kind: 'order-push'; customerId: number } | { kind: 'payment' })[] = [];
			page.on('response', (response) => {
				if (response.request().method() !== 'POST') return;
				if (wcposRestRoute(response.url()) !== PUSH_ORDERS || response.status() >= 400) return;
				events.push({
					kind: 'order-push',
					customerId: Number(pushedPayload(response)?.customer_id ?? 0),
				});
			});
			page.on('request', (sent) => {
				if (sent.method() !== 'POST') return;
				if (/^\/wcpos\/v2\/orders\/\d+\/payments$/.test(wcposRestRoute(sent.url()) ?? '')) {
					events.push({ kind: 'payment' });
				}
			});

			const label = newRunLabel();
			await stampRunLabel(page, label);
			const { orderId, mode } = await openCheckout(page, (order) =>
				trackOrder({ ...order, label })
			);
			const { authorization, descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);
			const cash = descriptors.find(
				(method) =>
					method.pos_enabled && method.capture?.mode === 'manual' && method.kind === 'cash'
			);
			liveTest.skip(!cash, 'store declares no manual cash method');

			const balance = await readAmountMinor(page, 'checkout-balance');
			await page.getByTestId(`checkout-method-${cash!.id}`).click();
			await expect
				.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
				.toBe(balance);
			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');
			await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({ timeout: 120_000 });

			const order = await pollOrder(
				request,
				testInfo,
				authorization,
				orderId,
				(candidate) =>
					Number(candidate.customer_id) > 0 &&
					Boolean(candidate.date_paid_gmt ?? candidate.date_paid),
				'the paid server order must carry the customer created offline'
			);
			expectOrderPaid(order);

			const { headers, params } = storeRequestOptions(authorization);
			const response = await probeGet(request, storeUrl, 'customers', {
				headers,
				params: { ...params, search: probe },
			});
			expect(response.ok(), `GET customers?search=${probe} -> ${response.status()}`).toBe(true);
			const customers = (await response.json()) as { id?: number; email?: string }[];
			const created = customers.find((customer) => customer.email === email);
			expect(created?.id, 'the customer created from the cart reached the store').toBeGreaterThan(
				0
			);
			expect(Number(order.customer_id)).toBe(created!.id);

			// The order never reached payment as a guest: an accepted order push carrying
			// the customer's id went out before the first payment POST.
			const firstPayment = events.findIndex((event) => event.kind === 'payment');
			expect(firstPayment, 'the payment POST must have been seen').toBeGreaterThanOrEqual(0);
			const stampedBeforePayment = events
				.slice(0, firstPayment)
				.some((event) => event.kind === 'order-push' && event.customerId === created!.id);
			expect(
				stampedBeforePayment,
				`an order push carrying customer ${created!.id} must precede the payment; saw ${JSON.stringify(events)}`
			).toBe(true);
		}
	);
});
