// Route matchers and stubs for the checkout's gateway list, contract calls and push acks.
// Shared by `pos-checkout.spec.ts` and `journeys/sell-to-a-guest.spec.ts`.
import { type Page } from '@playwright/test';

import { isRouteTeardownError, isWcposRestRoute, wcposRestRoute } from './fixtures';

/** The gateway list, in both permalink spellings. */
export function isPaymentGatewaysUrl(url: URL): boolean {
	return isWcposRestRoute(url.href, '/wcpos/v2/payment-gateways');
}

/** A gateway's checkout-contract bootstrap, in both permalink spellings. */
export function isGatewayBootstrapUrl(url: URL): boolean {
	return /^\/wcpos\/v2\/payment-gateways\/[^/]+\/bootstrap$/.test(wcposRestRoute(url.href) ?? '');
}

/** An order's checkout-contract call, in both permalink spellings. */
export function isOrderCheckoutUrl(url: URL): boolean {
	return /^\/wcpos\/v2\/orders\/[^/]+\/checkout$/.test(wcposRestRoute(url.href) ?? '');
}

/**
 * Wait for the payment-gateways fetch the checkout modal fires on mount.
 *
 * Must be created BEFORE the modal opens, so the listener is attached in time.
 * The no-op catch keeps a still-pending wait from surfacing as an unhandled
 * rejection when an earlier step fails the test — an unhandled rejection here
 * takes down the whole worker process (see #997).
 */
export function gatewaysResponse(page: Page) {
	const pending = page.waitForResponse(
		(response) => isWcposRestRoute(response.url(), '/wcpos/v2/payment-gateways'),
		{ timeout: 90_000 }
	);
	pending.catch(() => {});
	return pending;
}

// Keep the server-omits-payment-link premise independent of woocommerce-pos#1352's ack shape.
export async function omitPaymentLinkFromPushAcks(page: Page) {
	const isPushOrders = (url: URL) =>
		url.pathname.endsWith('/wp-json/wcpos/v2/push/orders') ||
		url.searchParams.get('rest_route') === '/wcpos/v2/push/orders';
	await page.route(isPushOrders, async (route) => {
		try {
			const response = await route.fetch();
			let body: { document?: { links?: { payment?: unknown } } };
			try {
				body = await response.json();
			} catch {
				// Not JSON (e.g. a transient wp-env error page). Pass the original
				// response through so only this test sees the failure.
				await route.fulfill({ response });
				return;
			}
			delete body?.document?.links?.payment;
			await route.fulfill({ response, json: body });
		} catch (error) {
			if (isRouteTeardownError(error)) {
				return;
			}
			// Throwing from a route handler surfaces as an unhandled rejection and
			// kills the whole worker process (every test in the shard fails).
			console.warn('[omitPaymentLinkFromPushAcks] Route handler failed; aborting request:', error);
			await route.abort().catch(() => {});
		}
	});
}
