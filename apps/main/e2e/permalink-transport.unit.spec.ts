import { expect, test } from '@playwright/test';

import { isWcposRestRoute, wcposRestRoute } from './fixtures';

/**
 * Unit-style pins for the permalink-spelling matcher — no page, no store.
 *
 * These exist because the spelling a spec sees is NOT a property of the store.
 * It is chosen per session, at hydration: the client probes the pretty form
 * first and latches `use_rest_route_param` for the whole session the moment
 * that probe fails to answer — a saturated store aborting one echo request is
 * enough. Ten pro specs failed that way on 2026-08-24 (run 32745293277) while
 * the store's access log for that window held nothing but 200s, because their
 * waiters matched `/wp-json/...` and the app was sending `?rest_route=...`.
 *
 * So the pins below are deliberately paired: every route is asserted in BOTH
 * spellings. A matcher that regresses to one of them goes red here, where it
 * costs seconds, instead of as a 90-second timeout against a healthy store.
 */
const STORE = 'https://dev-pro.wcpos.com';

test.describe('wcposRestRoute', () => {
	test('reads the same route out of both permalink spellings', () => {
		expect(wcposRestRoute(`${STORE}/wp-json/wcpos/v2/variations?per_page=25&page=1`)).toBe(
			'/wcpos/v2/variations'
		);
		expect(wcposRestRoute(`${STORE}/?rest_route=/wcpos/v2/variations&per_page=25&page=1`)).toBe(
			'/wcpos/v2/variations'
		);
	});

	test('decodes the percent-encoded plain spelling the app actually sends', () => {
		// Observed on the wire: the client encodes the slashes on most routes and
		// leaves them raw on others. Both must read the same.
		expect(wcposRestRoute(`${STORE}/?rest_route=%2Fwcpos%2Fv2%2Fvariations&per_page=2`)).toBe(
			'/wcpos/v2/variations'
		);
		expect(wcposRestRoute(`${STORE}/?rest_route=/wcpos/v2/payment-gateways&store_id=24128`)).toBe(
			'/wcpos/v2/payment-gateways'
		);
	});

	test('handles the /index.php plain form and sub-routes', () => {
		expect(wcposRestRoute(`${STORE}/index.php?rest_route=/wcpos/v2/orders/999/refunds`)).toBe(
			'/wcpos/v2/orders/999/refunds'
		);
		expect(wcposRestRoute(`${STORE}/wp-json/wcpos/v2/orders/999/refunds`)).toBe(
			'/wcpos/v2/orders/999/refunds'
		);
	});

	test('returns null for URLs that address no WCPOS route', () => {
		expect(wcposRestRoute(`${STORE}/wp-json/wc/v3/products/7`)).toBeNull();
		expect(wcposRestRoute(`${STORE}/?rest_route=/wc/v3/products`)).toBeNull();
		expect(wcposRestRoute(`${STORE}/pos/settings`)).toBeNull();
		expect(wcposRestRoute('not-a-url')).toBeNull();
	});
});

test.describe('isWcposRestRoute', () => {
	test('matches a route in both spellings and rejects a different route', () => {
		for (const url of [
			`${STORE}/wp-json/wcpos/v2/payment-gateways?_wcpos_envelope=1&store_id=24128`,
			`${STORE}/?rest_route=/wcpos/v2/payment-gateways&_wcpos_envelope=1&store_id=24128`,
		]) {
			expect(isWcposRestRoute(url, '/wcpos/v2/payment-gateways'), url).toBe(true);
			expect(isWcposRestRoute(url, '/wcpos/v2/variations'), url).toBe(false);
		}
	});

	test('does not match a longer route that merely starts with the same segments', () => {
		const bootstrap = `${STORE}/wp-json/wcpos/v2/payment-gateways/pos_cash/bootstrap`;
		expect(isWcposRestRoute(bootstrap, '/wcpos/v2/payment-gateways')).toBe(false);
		expect(wcposRestRoute(bootstrap)).toBe('/wcpos/v2/payment-gateways/pos_cash/bootstrap');
	});
});
