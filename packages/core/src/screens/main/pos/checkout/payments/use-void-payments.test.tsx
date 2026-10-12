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

jest.mock('../../../../../contexts/app-state', () => {
	const session = { store: { price_num_decimals: 2 } };
	return { useStoreSession: () => session };
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
	const ledger = (status: string) => [
		{ key: '_wcpos_payments', value: { schema: 1, payments: [{ id: 'payment-1', status }] } },
	];
	// The stored total is the store's (12.06), not what the lines add up to: the sweep moves it by
	// the dropped fee alone. An older rounding names a row this void does not touch and stays.
	const fees = [
		{
			id: 7,
			name: 'Rounding',
			total: '0.02',
			total_tax: '0.00',
			meta_data: [posData('payment-1')],
		},
		{ name: 'Rounding', total: '0.01', total_tax: '0.00', meta_data: [posData('payment-0')] },
	];
	let payload: Record<string, unknown>;
	const rounded = {
		uuid: 'order-1',
		get payload() {
			return payload;
		},
		getLatest: () => ({ payload }),
	} as unknown as EngineRecord<'orders'>;
	const apply = async ({ data, changes }: { data?: object; changes?: object }) => {
		payload = { ...payload, ...(data ?? changes) };
		return {};
	};
	beforeEach(() => {
		jest.clearAllMocks();
		payload = { id: 42, total: '12.06', fee_lines: fees, meta_data: ledger('captured') };
		mockLocalPatch.mockImplementation(apply);
		mockMirror.mockImplementation(apply);
	});
	afterEach(() => {
		mockStatus = 'offline';
	});
	const sweep = () => mockLocalPatch.mock.calls.map(([{ data }]) => data).find((d) => d.fee_lines);

	it('offline: after the void, the sweep tombstones the fee and moves the total by it', async () => {
		const { result } = renderHook(() => useVoidPayments());
		await act(async () => {
			await result.current(rounded);
		});
		expect(mockLocalPatch).toHaveBeenCalledTimes(2);
		expect(mockLocalPatch.mock.calls[0][0].data.status).toBe('pos-open');
		expect(sweep()).toEqual({ fee_lines: [{ ...fees[0], name: null }, fees[1]], total: '12.04' });
	});

	it('online: the store voids the row, and the sweep after the mirror pushes the fee removal', async () => {
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
		expect(sweep()).toMatchObject({ total: '12.04' });
	});

	it('a later void with no live rows still sweeps a fee an earlier drop left behind', async () => {
		payload = { ...payload, meta_data: ledger('voided') };
		const { result } = renderHook(() => useVoidPayments());
		await act(async () => {
			await result.current(rounded);
		});
		expect(mockPost).not.toHaveBeenCalled();
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(sweep()).toMatchObject({ total: '12.04' });
	});

	it('a row the store refused to void keeps its fee', async () => {
		mockStatus = 'online-website-available';
		mockPost.mockRejectedValue({ response: { data: { message: 'no' } } });
		const { result } = renderHook(() => useVoidPayments());
		await act(async () => {
			await result.current(rounded);
		});
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(payload.fee_lines).toBe(fees);
	});

	it('leaves the fees alone when no voided row is rounded', async () => {
		payload = { ...payload, fee_lines: [fees[1]] };
		const { result } = renderHook(() => useVoidPayments());
		await act(async () => {
			await result.current(rounded);
		});
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(Object.keys(mockLocalPatch.mock.calls[0][0].data).sort()).toEqual([
			'meta_data',
			'status',
		]);
	});
});
