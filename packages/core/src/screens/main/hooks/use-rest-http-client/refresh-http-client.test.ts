import { createRefreshHttpClient } from './refresh-http-client';

describe('createRefreshHttpClient', () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		global.fetch = originalFetch;
	});

	it('aborts a refresh request after 15 seconds', () => {
		global.fetch = jest.fn(() => new Promise<Response>(() => undefined));

		void createRefreshHttpClient().post('/refresh', {});

		const signal = jest.mocked(global.fetch).mock.calls[0][1]?.signal;
		expect(signal?.aborted).toBe(false);

		jest.advanceTimersByTime(15_000);

		expect(signal?.aborted).toBe(true);
	});
});
