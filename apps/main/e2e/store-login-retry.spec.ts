import { expect, test } from './test';
import { isStoreUnreachable, loginRetryDelaysMs, setupStaggerMs } from './store-login-retry';

test('store-outage signatures are retryable', () => {
	expect(
		isStoreUnreachable('Authorization probes unreachable — store appears offline (0/2 responded)')
	).toBe(true);
	expect(isStoreUnreachable('warning: [SYNC121] request timed out (status 0)')).toBe(true);
	expect(isStoreUnreachable('error: Failed to test authorization methods')).toBe(true);
});

test('a site-probe timeout is retryable with either permalink style', () => {
	expect(
		isStoreUnreachable(
			'[global-setup] [free] warning: 12:19:37 PM | ERROR : HTTP request failed: GET /wp-json/wcpos/v2/site | Context: {"category":"wcpos.http.client","name":"AxiosError","message":"timeout of 15000ms exceeded", ...}'
		)
	).toBe(true);
	expect(
		isStoreUnreachable(
			'[global-setup] [free] warning: 12:19:37 PM | ERROR : HTTP request failed: GET rest_route=/wcpos/v2/site | Context: {"category":"wcpos.http.client","name":"AxiosError","message":"timeout of 15000ms exceeded", ...}'
		)
	).toBe(true);
});

test('site HTTP errors and timeouts without a site probe on the same line are not retryable', () => {
	expect(
		isStoreUnreachable(
			'HTTP request failed: GET /wp-json/wcpos/v2/site | Request failed with status code 404'
		)
	).toBe(false);
	expect(
		isStoreUnreachable(
			'HTTP request failed: GET /wp-json/wcpos/v2/products | timeout of 15000ms exceeded'
		)
	).toBe(false);
	expect(isStoreUnreachable('GET /wp-json/wcpos/v2/site\ntimeout of 15000ms exceeded')).toBe(false);
});

test('an ordinary login failure is not retryable', () => {
	expect(
		isStoreUnreachable(
			"Timed out 30000ms waiting for expect(locator).toBeVisible()\nLocator: getByTestId('search-products')"
		)
	).toBe(false);
	expect(loginRetryDelaysMs).toHaveLength(2);
});

test('setup is staggered by shard only in CI', () => {
	expect(setupStaggerMs(5, false)).toBe(0);
	expect(setupStaggerMs(5, true)).toBe(150_000);
	expect(setupStaggerMs(0, true)).toBe(0);
});
