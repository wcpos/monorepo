/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useLocalMutation } from './use-local-mutation';

const mockUseT = jest.fn();
const mockConvertLocalDateToUTCString = jest.fn((_date: Date) => '2026-03-02T00:00:00');
const mockWrite = jest.fn();
const mockFindOneExec = jest.fn();
const mockStatus = jest.fn();

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
			status: mockStatus,
		},
	}),
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
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1', recordId: 'order-uuid' });
		mockStatus.mockReturnValue({ activeScopeId: 'scope-1' });
		mockUseT.mockReturnValue((_key: string, options?: Record<string, unknown>) =>
			String(options?.message || '')
		);
	});

	it('patches a brand-new temporary order locally without requiring an engine resident', async () => {
		const stored: Record<string, unknown> = {
			uuid: 'temporary-order-uuid',
			status: 'pos-open',
			customer_id: 0,
		};
		const incrementalModify = jest.fn(
			async (modifier: (old: Record<string, unknown>) => Record<string, unknown>) => {
				Object.assign(stored, modifier(stored));
				return stored;
			}
		);
		const latest = { incrementalModify };
		const document = {
			uuid: 'temporary-order-uuid',
			id: 0,
			isNew: true,
			collection: {
				name: 'orders',
				schema: {
					jsonSchema: { properties: { date_modified_gmt: { type: 'string' } } },
				},
			},
			getLatest: () => latest,
		};

		const { result } = renderHook(() => useLocalMutation());
		const patchResult = await act(() =>
			result.current.localPatch({
				document: document as never,
				data: { customer_id: 91 } as never,
			})
		);

		expect(stored).toMatchObject({
			customer_id: 91,
			date_modified_gmt: '2026-03-02T00:00:00',
		});
		expect(patchResult?.document).toBe(stored);
		expect(mockFindOneExec).not.toHaveBeenCalled();
		expect(mockWrite).not.toHaveBeenCalled();
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
		expect(mockWrite).toHaveBeenCalledWith({
			collection: 'orders',
			operation: 'update',
			recordId: 'order-uuid',
			payload: {
				status: 'processing',
				date_modified_gmt: '2026-03-02T00:00:00',
			},
		});
		expect(patchResult?.changes).toEqual({
			status: 'processing',
			date_modified_gmt: '2026-03-02T00:00:00',
		});
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

		expect(mockWrite).toHaveBeenCalledWith({
			collection: 'orders',
			operation: 'update',
			recordId: 'order-uuid',
			payload: expect.objectContaining({
				line_items: [{ product_id: 7 }],
			}),
		});
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
		mockWrite.mockRejectedValue(new Error('queue unavailable'));
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

	it('compensates and retries the resident patch once when the active scope changes', async () => {
		let activeScopeId = 'scope-1';
		mockStatus.mockImplementation(() => ({ activeScopeId }));
		const firstStored: Record<string, unknown> = {
			id: 'order-uuid',
			wooOrderId: 42,
			status: 'pending',
			payload: { id: 42, status: 'pending' },
		};
		const secondStored = JSON.parse(JSON.stringify(firstStored)) as Record<string, unknown>;
		const resident = (stored: Record<string, unknown>) => ({
			incrementalModify: jest.fn(
				async (modifier: (old: Record<string, unknown>) => Record<string, unknown>) => {
					Object.assign(stored, modifier(stored));
					return stored;
				}
			),
			toJSON: () => JSON.parse(JSON.stringify(stored)),
		});
		mockFindOneExec
			.mockResolvedValueOnce(resident(firstStored))
			.mockResolvedValueOnce(resident(secondStored));
		mockWrite
			.mockImplementationOnce(async () => {
				activeScopeId = 'scope-2';
				return { mutationId: 'mutation-1', recordId: 'order-uuid' };
			})
			.mockResolvedValueOnce({ mutationId: 'mutation-2', recordId: 'order-uuid' });
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

		expect(firstStored).toMatchObject({
			status: 'pending',
			payload: { id: 42, status: 'pending' },
		});
		expect(secondStored).toMatchObject({
			status: 'processing',
			payload: { id: 42, status: 'processing' },
		});
		expect(mockWrite).toHaveBeenCalledTimes(2);
	});

	it('compensates and throws when the active scope changes twice', async () => {
		let activeScopeId = 'scope-1';
		mockStatus.mockImplementation(() => ({ activeScopeId }));
		const firstStored: Record<string, unknown> = {
			id: 'order-uuid',
			wooOrderId: 42,
			status: 'pending',
			payload: { id: 42, status: 'pending' },
		};
		const secondStored = JSON.parse(JSON.stringify(firstStored)) as Record<string, unknown>;
		const resident = (stored: Record<string, unknown>) => ({
			incrementalModify: jest.fn(
				async (modifier: (old: Record<string, unknown>) => Record<string, unknown>) => {
					Object.assign(stored, modifier(stored));
					return stored;
				}
			),
			toJSON: () => JSON.parse(JSON.stringify(stored)),
		});
		mockFindOneExec
			.mockResolvedValueOnce(resident(firstStored))
			.mockResolvedValueOnce(resident(secondStored));
		mockWrite
			.mockImplementationOnce(async () => {
				activeScopeId = 'scope-2';
				return { mutationId: 'mutation-1', recordId: 'order-uuid' };
			})
			.mockImplementationOnce(async () => {
				activeScopeId = 'scope-3';
				return { mutationId: 'mutation-2', recordId: 'order-uuid' };
			});
		const document = {
			uuid: 'order-uuid',
			id: 42,
			collection: { name: 'orders' },
			getLatest: () => document,
		};

		const { result } = renderHook(() => useLocalMutation());
		await expect(
			result.current.localPatch({
				document: document as never,
				data: { status: 'processing' } as never,
			})
		).rejects.toThrow('Active engine scope changed twice during orders mutation');

		expect(firstStored).toMatchObject({ status: 'pending', payload: { status: 'pending' } });
		expect(secondStored).toMatchObject({ status: 'pending', payload: { status: 'pending' } });
		expect(mockWrite).toHaveBeenCalledTimes(2);
	});
});
