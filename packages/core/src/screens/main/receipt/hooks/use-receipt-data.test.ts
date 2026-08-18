/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useReceiptData } from './use-receipt-data';

const mockGet = jest.fn();
const mockHttp = { get: mockGet };

jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => mockHttp,
}));

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('useReceiptData', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('does not expose the previous response while the next order is pending', async () => {
		const nextResponse = createDeferred<Record<string, unknown>>();
		mockGet
			.mockResolvedValueOnce({
				data: {
					order_id: 42,
					mode: 'live',
					has_snapshot: false,
					submission_status: 'sent',
					data: { order_id: 42 },
				},
			})
			.mockReturnValueOnce(nextResponse.promise);

		const { result, rerender } = renderHook(
			({ orderId }: { orderId: number }) => useReceiptData({ orderId }),
			{ initialProps: { orderId: 42 } }
		);

		await waitFor(() => expect(result.current.data).toEqual({ order_id: 42 }));

		rerender({ orderId: 43 });

		expect(result.current.data).toBeNull();
		expect(result.current.hasResponded).toBe(false);
		expect(mockGet).toHaveBeenLastCalledWith('/receipts/43', { params: { mode: 'live' } });

		await act(async () => {
			nextResponse.resolve({
				data: {
					order_id: 43,
					mode: 'live',
					has_snapshot: false,
					submission_status: 'sent',
					data: { order_id: 43 },
				},
			});
		});
	});
});
