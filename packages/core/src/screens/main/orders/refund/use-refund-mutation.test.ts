/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import {
	clearStorageDegradation,
	wrappedErrorHandlerStorage,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';

import {
	buildRefundPayload,
	createRefundIdempotencyKey,
	useRefundMutation,
} from './use-refund-mutation';
import { StorageBlockedError } from '../../hooks/use-storage-health';

const mockPost = jest.fn();
const mockEngineRequire = jest.fn();

const makeOrder = (id: number | undefined) => {
	const order = {
		payload: { id },
		getLatest: () => order,
	};
	return order;
};

jest.mock('uuid', () => ({
	v4: jest.fn(() => 'mock-uuid'),
}));

jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({
		post: mockPost,
	}),
}));

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: { require: mockEngineRequire } }),
}));

jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
	getLogger: () => ({ error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

describe('buildRefundPayload', () => {
	it('maps explicit cash destination to refund_destination=cash and api_refund=false', () => {
		expect(
			buildRefundPayload({
				amount: '10.00',
				reason: 'Cash drawer',
				lineItems: [],
				refundDestination: 'cash',
			})
		).toEqual({
			amount: '10.00',
			reason: 'Cash drawer',
			refund_destination: 'cash',
			api_refund: false,
		});
	});

	it('maps explicit original_method to refund_destination=original_method and api_refund=true', () => {
		expect(
			buildRefundPayload({
				amount: '12.00',
				reason: 'Original gateway',
				lineItems: [],
				refundDestination: 'original_method',
			})
		).toEqual({
			amount: '12.00',
			reason: 'Original gateway',
			refund_destination: 'original_method',
			api_refund: true,
		});
	});

	it('preserves line item ids for transitional payload compatibility', () => {
		expect(
			buildRefundPayload({
				amount: '12.00',
				reason: 'Partial',
				lineItems: [
					{
						id: 99,
						quantity: 1,
						refund_total: '10.00',
						refund_tax: [{ id: 1, refund_total: '2.00' }],
					},
				],
				refundDestination: 'original_method',
			})
		).toEqual({
			amount: '12.00',
			reason: 'Partial',
			refund_destination: 'original_method',
			api_refund: true,
			line_items: [
				{
					id: 99,
					item_id: 99,
					quantity: 1,
					refund_total: '10.00',
					refund_tax: [{ id: 1, refund_total: '2.00' }],
				},
			],
		});
	});
});

describe('useRefundMutation', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockPost.mockResolvedValue({ data: { refund_id: 123 } });
		mockEngineRequire.mockReturnValue({ ready: Promise.resolve(), release: jest.fn() });
	});

	it('posts the stable refund payload with an idempotency header and refreshes the order', async () => {
		const order = makeOrder(77);

		const { result } = renderHook(() => useRefundMutation());

		await act(async () => {
			await result.current({
				order: order as never,
				amount: '10.00',
				reason: 'Counter refund',
				lineItems: [],
				refundDestination: 'cash',
			});
		});

		expect(mockPost).toHaveBeenCalledWith(
			'orders/77/refunds',
			expect.objectContaining({
				amount: '10.00',
				refund_destination: 'cash',
				api_refund: false,
			}),
			expect.objectContaining({
				headers: {
					'X-WCPOS-Idempotency-Key': 'refund-77-mock-uuid',
				},
			})
		);
		expect(mockEngineRequire).toHaveBeenCalledWith({
			id: 'refund:order-refresh:77',
			collection: 'orders',
			kind: 'targeted-records',
			remoteIds: ['77'],
			forceRefresh: true,
		});
		expect(mockEngineRequire.mock.results[0]?.value.release).toHaveBeenCalledTimes(1);
	});

	it('resolves when engine.require itself throws synchronously — the refund already succeeded', async () => {
		const order = makeOrder(78);
		mockEngineRequire.mockImplementationOnce(() => {
			throw new Error('engine_disposed');
		});

		const { result } = renderHook(() => useRefundMutation());

		await act(async () => {
			// The scheduling call can throw before a handle exists (e.g. the engine is
			// mid-dispose on a store switch). Same funds-safety rule as a failed
			// handle.ready: the POST already succeeded, so the mutation must resolve.
			await expect(
				result.current({
					order: order as never,
					amount: '10.00',
					reason: 'Counter refund',
					lineItems: [],
					refundDestination: 'cash',
				})
			).resolves.toEqual({ refund_id: 123 });
		});

		expect(mockPost).toHaveBeenCalledTimes(1);
	});

	it('resolves when the engine refresh fails — the refund already succeeded server-side', async () => {
		const order = makeOrder(77);
		const release = jest.fn();
		mockEngineRequire.mockReturnValueOnce({
			get ready() {
				return Promise.reject(new Error('refresh_failed'));
			},
			release,
		});

		const { result } = renderHook(() => useRefundMutation());

		await act(async () => {
			// Ported guard from the 1.9 lane ('returns a successful refund response
			// even when the local refresh fails'): once the POST succeeds, a refresh
			// failure must NOT reject — the error toast would invite a retry, and a
			// retry mints a fresh idempotency key, i.e. a second refund.
			await expect(
				result.current({
					order: order as never,
					amount: '10.00',
					reason: 'Counter refund',
					lineItems: [],
					refundDestination: 'cash',
				})
			).resolves.toEqual({ refund_id: 123 });
		});

		expect(mockPost).toHaveBeenCalledTimes(1);
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('fails fast when attempting to refund an order without a persisted id', async () => {
		const order = makeOrder(undefined);

		const { result } = renderHook(() => useRefundMutation());

		await expect(
			result.current({
				order: order as never,
				amount: '10.00',
				reason: 'Counter refund',
				lineItems: [],
				refundDestination: 'cash',
			})
		).rejects.toThrow('refund_requires_persisted_order');

		expect(mockPost).not.toHaveBeenCalled();
		expect(mockEngineRequire).not.toHaveBeenCalled();
	});
});

describe('createRefundIdempotencyKey', () => {
	it('builds a deterministic prefix for refund requests', () => {
		expect(createRefundIdempotencyKey(42)).toBe('refund-42-mock-uuid');
	});
});

/**
 * #163 follow-up ruling: refunds are a money path too. Cash handed BACK to a
 * customer with no persistable record is the same hazard as checkout, so the
 * mutation refuses at the last synchronous point before the POST.
 */
describe('useRefundMutation while storage is degraded', () => {
	afterEach(() => {
		clearStorageDegradation();
	});

	it('throws before posting the refund', async () => {
		const instance = {
			schema: { version: 0, type: 'object', properties: {}, primaryKey: 'id' },
			findDocumentsById: jest.fn(),
			bulkWrite: jest
				.fn()
				.mockRejectedValue(
					new Error(
						'could not requestRemote: {"methodName":"bulkWrite","error":{"message":"worker gone"}}'
					)
				),
			query: jest.fn(),
			count: jest.fn(),
			getAttachmentData: jest.fn(),
			getChangedDocumentsSince: jest.fn(),
			changeStream: jest.fn(),
			cleanup: jest.fn(),
			close: jest.fn().mockResolvedValue(undefined),
			remove: jest.fn(),
			collectionName: 'orders',
			databaseName: 'degraded-refund',
			internals: {},
			options: {},
		};
		const wrapped = await wrappedErrorHandlerStorage({
			storage: {
				name: 'mock-storage',
				rxdbVersion: '17.4.0',
				createStorageInstance: jest.fn().mockResolvedValue(instance),
			} as never,
		}).createStorageInstance({ databaseName: 'degraded-refund' } as never);
		await expect(wrapped.bulkWrite([{ document: { id: '1' } }] as never, 'test')).rejects.toThrow();

		const { result } = renderHook(() => useRefundMutation());

		await act(async () => {
			await expect(
				result.current({
					order: makeOrder(42) as never,
					amount: '10.00',
					reason: '',
					lineItems: [],
					refundDestination: 'cash',
				})
			).rejects.toBeInstanceOf(StorageBlockedError);
		});

		expect(mockPost).not.toHaveBeenCalled();
		expect(mockEngineRequire).not.toHaveBeenCalled();
	});
});
