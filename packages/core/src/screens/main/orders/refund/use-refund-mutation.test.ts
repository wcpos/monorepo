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

describe('buildRefundPayload', () => {
	it('maps non-gateway cash refunds to the cash destination', () => {
		expect(
			buildRefundPayload({
				amount: '10.00',
				reason: 'Cash drawer',
				lineItems: [],
				refundViaGateway: false,
				isCashPayment: true,
			})
		).toEqual({
			amount: '10.00',
			reason: 'Cash drawer',
			refund_destination: 'cash',
			api_refund: false,
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
				refundViaGateway: true,
				isCashPayment: false,
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
				refundViaGateway: false,
				isCashPayment: false,
			});
		});

		expect(mockPost).toHaveBeenCalledWith(
			'orders/77/refunds',
			expect.objectContaining({
				amount: '10.00',
				refund_destination: 'manual',
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
});

describe('createRefundIdempotencyKey', () => {
	it('builds a deterministic prefix for refund requests', () => {
		expect(createRefundIdempotencyKey(42)).toBe('refund-42-mock-uuid');
	});
});
