/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { usePushDocument } from './use-push-document';

const mockWrite = jest.fn();
const mockFindOneExec = jest.fn();
const mockAwaitWriteOutcome = jest.fn();
const mockSync = jest.fn();
const mockEvents = jest.fn();
const mockTranslate = jest.fn((_key: string, options?: Record<string, unknown>) =>
	String(options?.error || options?.message || '')
);

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({
		engine: {
			active: () => ({
				database: {
					collections: {
						orders: { findOne: () => ({ exec: mockFindOneExec }) },
					},
				},
			}),
			write: mockWrite,
			sync: mockSync,
			events: mockEvents,
		},
	}),
	awaitWriteOutcome: (...args: unknown[]) => mockAwaitWriteOutcome(...args),
}));

jest.mock('../../../contexts/translations', () => ({
	useT: () => mockTranslate,
}));

jest.mock('../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: () => '2026-03-02T00:00:00',
}));

describe('usePushDocument', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1', recordId: 'order-uuid' });
		mockAwaitWriteOutcome.mockResolvedValue('success');
	});

	it('enqueues the current resident payload instead of stale legacy document fields', async () => {
		const staleJson = {
			uuid: 'order-uuid',
			id: 123,
			status: 'pending',
			line_items: [{ id: 1, product_id: 42, quantity: 1 }],
		};
		const resident: Record<string, unknown> = {
			wooOrderId: 123,
			payload: {
				id: 123,
				status: 'processing',
				line_items: [{ id: 1, product_id: 42, quantity: 2 }],
			},
		};
		resident.get = (field: string) => resident[field];
		mockFindOneExec.mockResolvedValue(resident);
		const doc = {
			uuid: 'order-uuid',
			id: 123,
			collection: { name: 'orders' },
			getLatest: () => ({ ...doc, toJSON: () => staleJson }),
		};

		const { result } = renderHook(() => usePushDocument());

		await act(async () => {
			await result.current(doc as never);
		});

		expect(mockWrite).toHaveBeenCalledWith({
			collection: 'orders',
			operation: 'update',
			recordId: 'order-uuid',
			payload: expect.objectContaining({
				status: 'processing',
				line_items: [{ id: 1, product_id: 42, quantity: 2 }],
			}),
		});
	});

	it('enqueues a create when the resident document was born locally', async () => {
		const json = { uuid: 'order-uuid', id: 0, status: 'pos-open', line_items: [] };
		const resident: Record<string, unknown> = {
			wooOrderId: null,
			payload: json,
		};
		resident.get = (field: string) => resident[field];
		mockFindOneExec.mockResolvedValue(resident);
		const doc = {
			uuid: 'order-uuid',
			id: 0,
			collection: { name: 'orders' },
			getLatest: () => ({ ...doc, toJSON: () => json }),
		};

		const { result } = renderHook(() => usePushDocument());

		await act(async () => {
			await result.current(doc as never);
		});

		expect(mockWrite).toHaveBeenCalledWith({
			collection: 'orders',
			operation: 'create',
			recordId: 'order-uuid',
			payload: expect.objectContaining({
				status: 'pos-open',
				line_items: [],
			}),
		});
	});

	it('waits for an order acknowledgement and returns the rematerialized document id', async () => {
		const resident: Record<string, unknown> = {
			wooOrderId: null,
			payload: { status: 'pos-open' },
			collection: { name: 'orders' },
		};
		resident.get = (field: string) => resident[field];
		resident.getLatest = () => resident;
		mockFindOneExec.mockResolvedValue(resident);
		mockAwaitWriteOutcome.mockImplementationOnce(async () => {
			resident.wooOrderId = 987;
			resident.payload = { id: 987, number: '987', status: 'pending' };
			return 'success';
		});
		const doc = {
			uuid: 'order-uuid',
			id: null,
			collection: { name: 'orders' },
			getLatest: () => doc,
		};

		const { result } = renderHook(() => usePushDocument());
		const saved = await act(() => result.current(doc as never));

		expect(mockAwaitWriteOutcome).toHaveBeenCalledWith(
			expect.objectContaining({ write: mockWrite }),
			'mutation-1'
		);
		expect((saved as unknown as { id: number }).id).toBe(987);
		expect(mockFindOneExec).toHaveBeenCalledTimes(2);
	});

	it.each([
		['rejected', new Error('write-rejected for mutation "mutation-1"')],
		['timed out', new Error('Timed out waiting for mutation "mutation-1"')],
	])('throws when an order write outcome is %s', async (_label, error) => {
		const resident: Record<string, unknown> = {
			wooOrderId: null,
			payload: { status: 'pos-open' },
		};
		resident.get = (field: string) => resident[field];
		mockFindOneExec.mockResolvedValue(resident);
		mockAwaitWriteOutcome.mockRejectedValueOnce(error);
		const doc = {
			uuid: 'order-uuid',
			id: null,
			collection: { name: 'orders' },
			getLatest: () => doc,
		};

		const { result } = renderHook(() => usePushDocument());

		await expect(result.current(doc as never)).rejects.toThrow(error.message);
	});
});
