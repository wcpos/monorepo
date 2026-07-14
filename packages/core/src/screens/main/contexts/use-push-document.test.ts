/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { usePushDocument } from './use-push-document';

const mockWrite = jest.fn();
const mockSync = jest.fn();
const mockFindOneExec = jest.fn();
const mockWrapEngineDocument = jest.fn(
	(_collection: string, resident: Record<string, unknown>) => ({
		id: resident.wooOrderId,
	})
);
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
		},
	}),
}));

jest.mock('@wcpos/query/engine-adapter/document-proxy', () => ({
	wrapEngineDocument: (...args: [string, Record<string, unknown>]) =>
		mockWrapEngineDocument(...args),
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
		mockWrite.mockImplementation(async (_intent, options) => {
			await options?.prepare?.({
				database: {
					collections: {
						orders: { findOne: () => ({ exec: mockFindOneExec }) },
					},
				},
			});
			return { mutationId: 'mutation-1', recordId: 'order-uuid' };
		});
		mockSync.mockResolvedValue({ lane: 'write-drain', status: 'ran', pushed: 1 });
	});

	it('enqueues an update for a server-born resident document', async () => {
		const json = {
			uuid: 'order-uuid',
			id: 123,
			status: 'processing',
			line_items: [{ id: 1, product_id: 42, quantity: 1 }],
		};
		const resident: Record<string, unknown> & { incrementalModify?: jest.Mock } = {
			wooOrderId: 123,
			payload: { status: 'pending' },
		};
		resident.get = (field: string) => resident[field];
		resident.toJSON = () => JSON.parse(JSON.stringify(resident));
		resident.getLatest = () => resident;
		resident.incrementalModify = jest.fn(async (modifier) => {
			Object.assign(resident, modifier(resident));
			return resident;
		});
		mockFindOneExec.mockResolvedValue(resident);
		const doc = {
			uuid: 'order-uuid',
			id: 123,
			collection: { name: 'orders' },
			getLatest: () => ({ ...doc, toJSON: () => json }),
		};

		const { result } = renderHook(() => usePushDocument());

		await act(async () => {
			await result.current(doc as never);
		});

		expect(mockWrite).toHaveBeenCalledWith(
			{
				collection: 'orders',
				operation: 'update',
				recordId: 'order-uuid',
				payload: expect.objectContaining({
					status: 'processing',
					line_items: [{ id: 1, product_id: 42, quantity: 1 }],
				}),
			},
			expect.objectContaining({ prepare: expect.any(Function), rollback: expect.any(Function) })
		);
	});

	it('enqueues a create when the resident document was born locally', async () => {
		const json = { uuid: 'order-uuid', id: 0, status: 'pos-open', line_items: [] };
		const resident: Record<string, unknown> & { incrementalModify?: jest.Mock } = {
			wooOrderId: null,
			payload: json,
		};
		resident.get = (field: string) => resident[field];
		resident.toJSON = () => JSON.parse(JSON.stringify(resident));
		resident.getLatest = () => resident;
		resident.incrementalModify = jest.fn(async (modifier) => {
			Object.assign(resident, modifier(resident));
			return resident;
		});
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

		expect(mockWrite).toHaveBeenCalledWith(
			{
				collection: 'orders',
				operation: 'create',
				recordId: 'order-uuid',
				payload: expect.objectContaining({
					status: 'pos-open',
					line_items: [],
				}),
			},
			expect.objectContaining({ prepare: expect.any(Function), rollback: expect.any(Function) })
		);
		expect(mockSync).not.toHaveBeenCalled();
	});

	it('waits for a Woo order id when checkout requires acknowledgement', async () => {
		const json = { uuid: 'order-uuid', id: 0, status: 'pos-open', line_items: [] };
		const resident: Record<string, unknown> & { incrementalModify?: jest.Mock } = {
			wooOrderId: null,
			payload: json,
		};
		resident.get = (field: string) => resident[field];
		resident.toJSON = () => JSON.parse(JSON.stringify(resident));
		resident.getLatest = () => resident;
		resident.incrementalModify = jest.fn(async (modifier) => {
			Object.assign(resident, modifier(resident));
			return resident;
		});
		mockFindOneExec.mockResolvedValue(resident);
		mockSync.mockImplementation(async () => {
			resident.wooOrderId = 321;
			resident.payload = { ...(resident.payload as object), id: 321 };
			return { lane: 'write-drain', status: 'ran', pushed: 1 };
		});
		const doc = {
			uuid: 'order-uuid',
			id: 0,
			collection: { name: 'orders' },
			getLatest: () => ({ ...doc, toJSON: () => json }),
		};

		const { result } = renderHook(() => usePushDocument());
		const saved = await act(() => result.current(doc as never, { requireRemoteId: true }));

		expect(mockSync).toHaveBeenCalledWith('write-drain');
		expect(saved).toEqual({ id: 321 });
	});
});
