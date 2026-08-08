import {
	lastNetworkResponseAt,
	reportNetworkResponse,
	subscribeNetworkPulse,
} from './network-pulse';

describe('network pulse', () => {
	it('records the latest response time', () => {
		const now = jest.spyOn(Date, 'now').mockReturnValue(1234);

		expect(lastNetworkResponseAt()).toBeNull();
		reportNetworkResponse();
		expect(lastNetworkResponseAt()).toBe(1234);

		now.mockRestore();
	});

	it('notifies subscribers until they unsubscribe', () => {
		const subscriber = jest.fn();
		const unsubscribe = subscribeNetworkPulse(subscriber);

		reportNetworkResponse();
		expect(subscriber).toHaveBeenCalledTimes(1);

		unsubscribe();
		reportNetworkResponse();
		expect(subscriber).toHaveBeenCalledTimes(1);
	});
});
