/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { usePushDocument } from './use-push-document';

const mockWrite = jest.fn();
const mockFindOneExec = jest.fn();
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
		},
	}),
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

		expect(mockWrite).toHaveBeenCalledWith({
			collection: 'orders',
			operation: 'update',
			recordId: 'order-uuid',
			payload: expect.objectContaining({
				status: 'processing',
				line_items: [{ id: 1, product_id: 42, quantity: 1 }],
			}),
		});
	});

	it('enqueues a create when the resident document was born locally', async () => {
		const json = { uuid: 'order-uuid', id: 0, status: 'pos-open', line_items: [] };
		const resident: Record<string, unknown> & { incrementalModify?: jest.Mock } = {
			wooOrderId: null,
			payload: json,
		};
		resident.get = (field: string) => resident[field];
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
});
