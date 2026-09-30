/**
 * A customer created from the cart while the store is unreachable (#1523).
 *
 * Save must attach the customer to the order at once — no network wait, no
 * failure toast — and once the store is reachable again the SERVER order must
 * carry that customer's new Woo id: the customer create drains, and its ack
 * re-stamps the order's `customer_id` (`NewCustomerLinkBridge`).
 *
 * Store-agnostic per CLAUDE.md: the order is built through the POS UI from
 * this run's private probe product, the customer is minted with a probe token,
 * and the assertion is on THAT customer's id, read back from the store by its
 * probe email. The customer is left behind by design (unique per run).
 */
import { expect, type Page, type Route } from '@playwright/test';

import { addCheckoutProbeProduct } from './checkout-probe';
import { openCheckout, pollOrder } from './checkout-shared';
import { ensureRegisterOpen, getStoreUrl, getStoreVariant, storeRequestOptions } from './fixtures';
import { liveOrderTest as liveTest, newRunLabel, stampRunLabel } from './order-lifecycle';
import { resolveProbeAuthorization } from './probe-credential';
import { mintSearchProbeToken, probeGet } from './search-probe';

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

liveTest.describe('Cart: new customer while the store is unreachable (#1523)', () => {
	// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
	liveTest.beforeEach(async ({}, testInfo) => {
		liveTest.skip(getStoreVariant(testInfo) !== 'pro', 'Adding customers from cart requires Pro');
	});

	liveTest(
		'attaches the customer at once, and the server order carries its id once the store is back',
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

			const label = newRunLabel();
			await stampRunLabel(page, label);
			const { orderId } = await openCheckout(page, (order) => trackOrder({ ...order, label }));

			const authorization = await resolveProbeAuthorization(request, storeUrl, storeAuthorization, {
				route: '/wcpos/v2/orders',
			});
			const order = await pollOrder(
				request,
				testInfo,
				authorization,
				orderId,
				(candidate) => Number(candidate.customer_id) > 0,
				'the server order must carry the customer created offline'
			);

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
		}
	);
});
