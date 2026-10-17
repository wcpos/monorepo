/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

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

	// The receipt falls back to locally built data and still prints: never a
	// warn/error row, and never PRINT999 "printing hit a problem".
	it.each([
		[{ isSleeping: true }, 'debug'],
		[{ blockCode: 'preflight-offline' }, 'debug'],
		[{ blockCode: 'preflight-auth-required' }, 'info'],
		[{}, 'info'],
	] as const)(
		'logs receipt refusal %j at %s without changing the result',
		async (fields, level) => {
			const error = Object.assign(new Error('refused'), fields);
			mockGet.mockRejectedValueOnce(error);
			const { result } = renderHook(() => useReceiptData({ orderId: 42 }));
			await waitFor(() => expect(result.current.error).toBe(error));
			expect(getLogger([])[level]).toHaveBeenCalledWith(
				'Receipt built from local data: server receipt data unavailable',
				{ context: { orderId: 42, mode: 'live', error: 'refused' } }
			);
			expect(getLogger([]).error).not.toHaveBeenCalled();
			expect(getLogger([]).warn).not.toHaveBeenCalled();
		}
	);

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
