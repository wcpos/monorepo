/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useServerFeature } from './use-server-feature';

const mockGet = jest.fn();
const mockHttp = { get: mockGet };
let mockSiteUuid = 'site-a';

jest.mock('./use-rest-http-client', () => ({
	useRestHttpClient: () => mockHttp,
}));
jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => ({ site: { uuid: mockSiteUuid } }),
}));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

// The answer is kept per site for the session, so each test asks for its own site.
let site = 0;
beforeEach(() => {
	mockGet.mockReset();
	mockSiteUuid = `site-${++site}`;
});

describe('useServerFeature', () => {
	it('is false until the status answers, then true when the server lists the feature', async () => {
		const status = deferred<unknown>();
		mockGet.mockReturnValue(status.promise);
		const { result } = renderHook(() => useServerFeature('order_cashier_reassignment'));
		expect(result.current).toBe(false);
		expect(mockGet).toHaveBeenCalledWith('status');
		await act(async () => {
			status.resolve({ data: { capabilities: ['order_cashier_reassignment'] } });
		});
		expect(result.current).toBe(true);
	});

	it('is false when an older plugin does not list the feature or sends no list', async () => {
		mockGet.mockResolvedValue({ data: { capabilities: ['something_else'] } });
		const listed = renderHook(() => useServerFeature('order_cashier_reassignment'));
		await act(async () => {});
		expect(listed.result.current).toBe(false);

		mockSiteUuid = `site-${++site}`;
		mockGet.mockResolvedValue({ data: {} });
		const bare = renderHook(() => useServerFeature('order_cashier_reassignment'));
		await act(async () => {});
		expect(bare.result.current).toBe(false);
	});

	it('is false when the status request fails, and asks again on the next mount', async () => {
		mockGet.mockRejectedValueOnce(new Error('HTTP 404'));
		const failed = renderHook(() => useServerFeature('order_cashier_reassignment'));
		await act(async () => {});
		expect(failed.result.current).toBe(false);
		failed.unmount();

		mockGet.mockResolvedValue({ data: { capabilities: ['order_cashier_reassignment'] } });
		const retried = renderHook(() => useServerFeature('order_cashier_reassignment'));
		await act(async () => {});
		expect(retried.result.current).toBe(true);
		expect(mockGet).toHaveBeenCalledTimes(2);
	});

	it('fetches the status once per site', async () => {
		mockGet.mockResolvedValue({ data: { capabilities: ['order_cashier_reassignment'] } });
		const first = renderHook(() => useServerFeature('order_cashier_reassignment'));
		await act(async () => {});
		first.unmount();
		const second = renderHook(() => useServerFeature('order_cashier_reassignment'));
		await act(async () => {});
		expect(second.result.current).toBe(true);
		expect(mockGet).toHaveBeenCalledTimes(1);

		mockSiteUuid = `site-${++site}`;
		second.rerender();
		await act(async () => {});
		expect(mockGet).toHaveBeenCalledTimes(2);
	});
});
