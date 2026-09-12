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

	it.each([
		[{ isSleeping: true }, 'warn'],
		[{ blockCode: 'preflight-offline' }, 'warn'],
		[{ blockCode: 'preflight-auth-required' }, 'error'],
		[{}, 'error'],
	] as const)(
		'logs receipt refusal %j at %s without changing the result',
		async (fields, level) => {
			const error = Object.assign(new Error('refused'), fields);
			mockGet.mockRejectedValueOnce(error);
			const { result } = renderHook(() => useReceiptData({ orderId: 42 }));
			await waitFor(() => expect(result.current.error).toBe(error));
			expect(getLogger([])[level]).toHaveBeenCalledWith('Failed to fetch receipt data', {
				code: 'PRINT999',
				context: { orderId: 42, mode: 'live', error: 'refused' },
			});
			expect(getLogger([])[level === 'warn' ? 'error' : 'warn']).not.toHaveBeenCalled();
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

it('omits intent for previews and requests marked data explicitly for print', async () => {
	mockGet.mockResolvedValue({ data: { data: { fiscal: { is_reprint: true, reprint_count: 1 } } } });
	const { result } = renderHook(() => useReceiptData({ orderId: 42 }));
	await waitFor(() => expect(result.current.hasResponded).toBe(true));
	expect(mockGet).toHaveBeenLastCalledWith('/receipts/42', { params: { mode: 'live' } });
	let printed;
	await act(async () => {
		printed = await result.current.fetchForPrint();
	});
	expect(mockGet).toHaveBeenLastCalledWith('/receipts/42', {
		params: { mode: 'live', intent: 'print' },
	});
	expect(printed).toEqual({ fiscal: { is_reprint: true, reprint_count: 1 } });
});
it('accepts the backward-compatible intent option', async () => {
	mockGet.mockResolvedValue({ data: { data: {} } });
	const { result } = renderHook(() => useReceiptData({ orderId: 42, intent: 'print' }));
	await waitFor(() => expect(result.current.hasResponded).toBe(true));
	expect(mockGet).toHaveBeenLastCalledWith('/receipts/42', {
		params: { mode: 'live', intent: 'print' },
	});
});

it('forces fiscal mode and preserves the refund selector for preview, print, and refetch', async () => {
	mockGet.mockResolvedValue({ data: { data: { fiscal: { document_type: 'refund' } } } });
	const { result, rerender } = renderHook(
		({ document }) => useReceiptData({ orderId: 42, mode: 'live', document }),
		{ initialProps: { document: 'refund:12' } }
	);
	await waitFor(() => expect(result.current.hasResponded).toBe(true));
	expect(mockGet).toHaveBeenLastCalledWith('/receipts/42', {
		params: { mode: 'fiscal', document: 'refund:12' },
	});
	await act(async () => {
		await result.current.fetchForPrint();
	});
	expect(mockGet).toHaveBeenLastCalledWith('/receipts/42', {
		params: { mode: 'fiscal', document: 'refund:12', intent: 'print' },
	});
	mockGet.mockReturnValueOnce(new Promise(() => {}));
	rerender({ document: 'refund:13' });
	expect(result.current.data).toBeNull();
	expect(mockGet).toHaveBeenLastCalledWith('/receipts/42', {
		params: { mode: 'fiscal', document: 'refund:13' },
	});
});

it('fetches an orderless closure preview and counts only print intent', async () => {
	mockGet.mockResolvedValue({ data: { data: { number: 1 } } });
	const { result } = renderHook(() =>
		useReceiptData({ orderId: undefined, document: 'closure:session' })
	);
	await waitFor(() => expect(result.current.data).toEqual({ number: 1 }));
	expect(mockGet).toHaveBeenLastCalledWith('/receipts/0', {
		params: { mode: 'fiscal', document: 'closure:session' },
	});
	await act(async () => {
		await result.current.fetchForPrint();
	});
	expect(mockGet).toHaveBeenLastCalledWith('/receipts/0', {
		params: { mode: 'fiscal', document: 'closure:session', intent: 'print' },
	});
});
