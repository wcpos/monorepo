/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useLocalMutation } from './use-local-mutation';

const mockUseT = jest.fn();
const mockConvertLocalDateToUTCString = jest.fn((_date: Date) => '2026-03-02T00:00:00');
const mockWrite = jest.fn();
const mockFindOneExec = jest.fn();
const mockWrapEngineDocument = jest.fn((_collection: string, resident: unknown) => ({ resident }));

const activeScope = {
	database: {
		collections: {
			orders: { findOne: () => ({ exec: mockFindOneExec }) },
		},
	},
};

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({
		engine: {
			active: () => activeScope,
			write: mockWrite,
		},
	}),
}));

jest.mock('@wcpos/query/engine-adapter/document-proxy', () => ({
	wrapEngineDocument: (...args: [string, unknown]) => mockWrapEngineDocument(...args),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => mockUseT(),
}));

jest.mock('../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: (date: Date) => mockConvertLocalDateToUTCString(date),
}));

describe('useLocalMutation', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockWrite.mockImplementation(async (_intent, options) => {
			await options?.prepare?.(activeScope);
			return { mutationId: 'mutation-1', recordId: 'order-uuid' };
		});
		mockUseT.mockReturnValue((_key: string, options?: Record<string, unknown>) =>
			String(options?.message || '')
		);
	});

	it('keeps a temporary new order on the local RxDB patch path', async () => {
		const stored: Record<string, unknown> = {
			uuid: 'temporary-order',
			status: 'pos-open',
		};
		const incrementalModify = jest.fn(
			async (modifier: (old: Record<string, unknown>) => Record<string, unknown>) => {
				Object.assign(stored, modifier(stored));
				return stored;
			}
		);
		const latest = { incrementalModify };
		const document = {
			uuid: 'temporary-order',
			id: null,
			isNew: true,
			collection: { name: 'orders' },
			getLatest: () => latest,
		};

		const { result } = renderHook(() => useLocalMutation());
		const patched = await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { customer_id: 77 } as never,
			})
		);

		expect(stored).toMatchObject({ customer_id: 77 });
		expect(mockFindOneExec).not.toHaveBeenCalled();
		expect(mockWrite).not.toHaveBeenCalled();
		expect(patched?.document).toBe(stored);
	});

	it('ignores undefined values in patch data', async () => {
		const persistedDoc = {
			barcode_scanning_prefix: '',
			barcode_scanning_suffix: '',
		};

		const incrementalModify = jest.fn(
			async (modifier: (old: Record<string, unknown>) => unknown) => {
				modifier(persistedDoc);
				return persistedDoc;
			}
		);

		const document = {
			id: 'store_1',
			collection: {
				name: 'stores',
				schema: {
					jsonSchema: {
						properties: {
							date_modified_gmt: { type: 'string' },
						},
					},
				},
			},
			getLatest: () => ({ incrementalModify }),
		};

		const { result } = renderHook(() => useLocalMutation());

		const patchResult = await act(async () => {
			return result.current.localPatch({
				document: document as never,
				data: {
					barcode_scanning_prefix: undefined,
				} as never,
			});
		});

		expect(persistedDoc.barcode_scanning_prefix).toBe('');
		expect(patchResult?.changes).not.toHaveProperty('barcode_scanning_prefix');
		expect(mockConvertLocalDateToUTCString).toHaveBeenCalledTimes(1);
	});

	it('optimistically patches a server-born resident and enqueues syncable fields', async () => {
		const stored: Record<string, unknown> = {
			id: 'order-uuid',
			wooOrderId: 42,
			status: 'pending',
			payload: { id: 42, status: 'pending' },
			sync: { revision: 'rev-1' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const incrementalModify = jest.fn(
			async (modifier: (old: Record<string, unknown>) => Record<string, unknown>) => {
				Object.assign(stored, modifier(stored));
				return stored;
			}
		);
		mockFindOneExec.mockResolvedValue({
			incrementalModify,
			toJSON: () => JSON.parse(JSON.stringify(stored)),
		});
		const document = {
			uuid: 'order-uuid',
			id: 42,
			collection: { name: 'orders' },
			getLatest: () => document,
		};

		const { result } = renderHook(() => useLocalMutation());
		const patchResult = await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { status: 'processing' } as never,
			})
		);

		expect(stored).toMatchObject({
			status: 'processing',
			payload: {
				status: 'processing',
				date_modified_gmt: '2026-03-02T00:00:00',
			},
		});
		expect(mockWrite).toHaveBeenCalledWith(
			{
				collection: 'orders',
				operation: 'update',
				recordId: 'order-uuid',
				payload: {
					status: 'processing',
					date_modified_gmt: '2026-03-02T00:00:00',
				},
			},
			expect.objectContaining({ prepare: expect.any(Function), rollback: expect.any(Function) })
		);
		expect(patchResult?.changes).toEqual({
			status: 'processing',
			date_modified_gmt: '2026-03-02T00:00:00',
		});
		expect(mockWrapEngineDocument).toHaveBeenCalledWith('orders', stored);
		expect(patchResult?.document).toEqual({ resident: stored });
	});

	it('enqueues born-local edits as updates for the write plane to fold into the pending create', async () => {
		const stored: Record<string, unknown> = {
			id: 'order-uuid',
			wooOrderId: null,
			status: 'pos-open',
			payload: { status: 'pos-open', line_items: [] },
			sync: { revision: '' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const incrementalModify = jest.fn(
			async (modifier: (old: Record<string, unknown>) => Record<string, unknown>) => {
				Object.assign(stored, modifier(stored));
				return stored;
			}
		);
		mockFindOneExec.mockResolvedValue({
			incrementalModify,
			toJSON: () => JSON.parse(JSON.stringify(stored)),
		});
		const document = {
			uuid: 'order-uuid',
			id: null,
			collection: { name: 'orders' },
			getLatest: () => document,
		};

		const { result } = renderHook(() => useLocalMutation());
		await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { line_items: [{ product_id: 7 }] } as never,
			})
		);

		expect(mockWrite).toHaveBeenCalledWith(
			{
				collection: 'orders',
				operation: 'update',
				recordId: 'order-uuid',
				payload: expect.objectContaining({
					line_items: [{ product_id: 7 }],
				}),
			},
			expect.objectContaining({ prepare: expect.any(Function), rollback: expect.any(Function) })
		);
	});

	it('restores the resident snapshot when the write intent cannot be enqueued', async () => {
		const stored: Record<string, unknown> = {
			id: 'order-uuid',
			wooOrderId: 42,
			status: 'pending',
			payload: { id: 42, status: 'pending' },
			sync: { revision: 'rev-1' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const incrementalModify = jest.fn(
			async (modifier: (old: Record<string, unknown>) => Record<string, unknown>) => {
				Object.assign(stored, modifier(stored));
				return stored;
			}
		);
		mockFindOneExec.mockResolvedValue({
			incrementalModify,
			toJSON: () => JSON.parse(JSON.stringify(stored)),
		});
		mockWrite.mockImplementationOnce(async (_intent, options) => {
			await options?.prepare?.(activeScope);
			await options?.rollback?.();
			throw new Error('queue unavailable');
		});
		const document = {
			uuid: 'order-uuid',
			id: 42,
			collection: { name: 'orders' },
			getLatest: () => document,
		};

		const { result } = renderHook(() => useLocalMutation());
		await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { status: 'processing' } as never,
			})
		);

		expect(stored).toMatchObject({
			status: 'pending',
			payload: { id: 42, status: 'pending' },
		});
	});
});
