/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { useVoidPayments } from './use-void-payments';

const mockLocalPatch = jest.fn();
const mockPost = jest.fn();
const mockMirror = jest.fn();
let mockStatus = 'offline';

jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: mockPost }),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({}) }));
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
	patchEngineResident: (input: unknown) => mockMirror(input),
}));

jest.mock('../../hooks/use-cart-config', () => {
	const { createCartConfig } = jest.requireActual('@wcpos/order-math');
	const config = createCartConfig({
		rates: [],
		allRates: [],
		calcTaxes: true,
		pricesIncludeTax: false,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: '',
		taxClassSlugs: ['standard'],
		calcDiscountsSequentially: false,
	});
	return { useCartConfig: () => config };
});

const order = {
	uuid: 'order-1',
	payload: {},
	getLatest: () => ({
		payload: {
			id: 42,
			meta_data: [
				{
					key: '_wcpos_payments',
					value: {
						schema: 1,
						payments: [{ id: 'payment-1', status: 'captured' }],
					},
				},
			],
		},
	}),
} as EngineRecord<'orders'>;

it('rejects an offline void when localPatch did not apply it', async () => {
	mockLocalPatch.mockResolvedValue(undefined);
	const { result } = renderHook(() => useVoidPayments());

	await act(async () => {
		await expect(result.current(order)).rejects.toThrow('offline_void_local_patch_failed');
	});
});

describe('the rounding fee of a voided cash leg (#66, #84)', () => {
	const posData = (paymentRef: string) => ({
		key: '_woocommerce_pos_data',
		value: {
			amount: '0.02',
			rounding: { increment: '0.05', mode: 'nearest', payment_ref: paymentRef },
		},
	});
	// 10.03 of goods, rounded to 10.05 for the cash row being voided; an older rounding names a
	// row this void does not touch and stays.
	const payload = {
		id: 42,
		total: '10.06',
		line_items: [{ name: 'Item', quantity: 1, total: '10.03', total_tax: '0.00' }],
		fee_lines: [
			{
				id: 7,
				name: 'Rounding',
				total: '0.02',
				total_tax: '0.00',
				meta_data: [posData('payment-1')],
			},
			{ name: 'Rounding', total: '0.01', total_tax: '0.00', meta_data: [posData('payment-0')] },
		],
		meta_data: [
			{
				key: '_wcpos_payments',
				value: { schema: 1, payments: [{ id: 'payment-1', status: 'captured' }] },
			},
		],
	};
	const rounded = {
		uuid: 'order-1',
		payload,
		getLatest: () => ({ payload }),
	} as unknown as EngineRecord<'orders'>;
	beforeEach(() => {
		jest.clearAllMocks();
		mockLocalPatch.mockResolvedValue({});
	});
	afterEach(() => {
		mockStatus = 'offline';
	});

	it('offline: the void patch tombstones the fee and restores the total', async () => {
		const { result } = renderHook(() => useVoidPayments());
		await act(async () => {
			await result.current(rounded);
		});
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		const { data } = mockLocalPatch.mock.calls[0][0];
		expect(data.status).toBe('pos-open');
		expect(data.fee_lines).toEqual([{ ...payload.fee_lines[0], name: null }, payload.fee_lines[1]]);
		expect(data.total).toBe('10.04');
	});

	it('online: the store voids the row, and the fee removal is pushed after the mirror', async () => {
		mockStatus = 'online-website-available';
		mockPost.mockResolvedValue({ data: { payment: { id: 'payment-1', status: 'voided' } } });
		const { result } = renderHook(() => useVoidPayments());
		await act(async () => {
			await result.current(rounded);
		});
		expect(mockMirror).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockMirror.mock.invocationCallOrder[0]).toBeLessThan(
			mockLocalPatch.mock.invocationCallOrder[0]
		);
		const { data } = mockLocalPatch.mock.calls[0][0];
		expect(data.fee_lines[0].name).toBeNull();
		expect(data.total).toBe('10.04');
	});

	it('leaves the fees alone when no voided row is rounded', async () => {
		const plain = { ...payload, fee_lines: [payload.fee_lines[1]] };
		const { result } = renderHook(() => useVoidPayments());
		await act(async () => {
			await result.current({ ...rounded, getLatest: () => ({ payload: plain }) } as typeof rounded);
		});
		expect(Object.keys(mockLocalPatch.mock.calls[0][0].data).sort()).toEqual([
			'meta_data',
			'status',
		]);
	});
});
