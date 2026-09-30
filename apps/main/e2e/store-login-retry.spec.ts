import { expect, test } from './test';
import { isStoreUnreachable, loginRetryDelaysMs, setupStaggerMs } from './store-login-retry';

test('store-outage signatures are retryable', () => {
	expect(
		isStoreUnreachable('Authorization probes unreachable — store appears offline (0/2 responded)')
	).toBe(true);
	expect(isStoreUnreachable('warning: [SYNC121] request timed out (status 0)')).toBe(true);
	expect(isStoreUnreachable('error: Failed to test authorization methods')).toBe(true);
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
	expect(setupStaggerMs(5, true)).toBe(50_000);
	expect(setupStaggerMs(0, true)).toBe(0);
});
