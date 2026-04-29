/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import {
	buildRefundPayload,
	createRefundIdempotencyKey,
	useRefundMutation,
} from './use-refund-mutation';

const mockPost = jest.fn();
const mockPullDocument = jest.fn();

jest.mock('uuid', () => ({
	v4: jest.fn(() => 'mock-uuid'),
}));

jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({
		post: mockPost,
	}),
}));

jest.mock('../../contexts/use-pull-document', () => ({
	usePullDocument: () => mockPullDocument,
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ error: jest.fn() }),
}));

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
	});

	it('posts the stable refund payload with an idempotency header and refreshes the order', async () => {
		const order = {
			id: 77,
			collection: {},
		};

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
		expect(mockPullDocument).toHaveBeenCalledWith(77, order.collection);
	});

	it('returns a successful refund response even when the local refresh fails', async () => {
		const order = {
			id: 77,
			collection: {},
		};
		mockPullDocument.mockRejectedValueOnce(new Error('refresh_failed'));

		const { result } = renderHook(() => useRefundMutation());

		let response: unknown;
		await act(async () => {
			response = await result.current({
				order: order as never,
				amount: '10.00',
				reason: 'Counter refund',
				lineItems: [],
				refundDestination: 'cash',
			});
		});

		expect(response).toEqual({ refund_id: 123 });
		expect(mockPost).toHaveBeenCalledTimes(1);
		expect(mockPullDocument).toHaveBeenCalledWith(77, order.collection);
	});

	it('fails fast when attempting to refund an order without a persisted id', async () => {
		const order = {
			id: undefined,
			collection: {},
		};

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
		expect(mockPullDocument).not.toHaveBeenCalled();
	});
});

describe('createRefundIdempotencyKey', () => {
	it('builds a deterministic prefix for refund requests', () => {
		expect(createRefundIdempotencyKey(42)).toBe('refund-42-mock-uuid');
	});
});
