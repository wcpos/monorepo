import {
	lastNetworkResponseAt,
	reportNetworkResponse,
	subscribeNetworkPulse,
} from './network-pulse';

describe('network pulse', () => {
	it('records the latest response time', () => {
		expect(lastNetworkResponseAt('https://one.example.test/wp-json/')).toBeNull();
		reportNetworkResponse('https://one.example.test/wp-json/', 1234);
		expect(lastNetworkResponseAt('https://one.example.test/wp-json/')).toBe(1234);
	});

	it('notifies only canonical-site subscribers until they unsubscribe', () => {
		const subscriber = jest.fn();
		const otherSubscriber = jest.fn();
		const unsubscribe = subscribeNetworkPulse('HTTPS://ONE.EXAMPLE.TEST/wp-json/', subscriber);
		subscribeNetworkPulse('https://other.example.test/wp-json/', otherSubscriber);

		reportNetworkResponse('one.example.test/wp-json');
		expect(subscriber).toHaveBeenCalledTimes(1);
		expect(otherSubscriber).not.toHaveBeenCalled();

		unsubscribe();
		reportNetworkResponse('https://one.example.test/wp-json/');
		expect(subscriber).toHaveBeenCalledTimes(1);
	});

	it('canonicalizes adversarial slash runs without excessive backtracking', () => {
		const site = `https://example.test/${'/'.repeat(50000)}x`;
		const startedAt = performance.now();

		reportNetworkResponse(site, 1234);

		expect(performance.now() - startedAt).toBeLessThan(500);
	});
});
