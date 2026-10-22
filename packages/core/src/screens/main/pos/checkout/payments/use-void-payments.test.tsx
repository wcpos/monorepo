/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import {
	type MetaDataEntry,
	type PaymentRow,
	readLedger,
	upsertPaymentRow,
	withLedger,
} from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import { useVoidPayments } from './use-void-payments';

const mockLocalPatch = jest.fn();
const mockPost = jest.fn();
const mockMirror = jest.fn();
let mockStatus = 'offline';
const mockWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: (...args: unknown[]) => mockWarn(...args) }),
}));

jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: mockPost }),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('@wcpos/query/store-local', () => ({
	readOrderCommands: async () => ({ entries: [], chain: null }),
}));
jest.mock('@wcpos/query', () => ({
	// Posts straight through; its mirror is the mocked mirrorServerOrder under a fixed revision.
	moneyCommandPoster: (input: {
		post: (url: string, body: unknown) => Promise<unknown>;
		runtime: unknown;
		orderUuid: string;
	}) =>
		Object.assign((url: string, body: unknown) => input.post(url, body), {
			mirror: (answer: object) =>
				jest
					.requireMock('@wcpos/query/mutations')
					.mirrorServerOrder(input.runtime, input.orderUuid, {
						...answer,
						sentRevision: 'sha256:sent',
					}),
			settle: async () => undefined,
		}),
	useQueryRuntime: () => ({}),
	useDocField: (doc: unknown, pick: (doc: unknown) => unknown) => pick(doc),
}));
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

jest.mock('../../../../../contexts/app-state', () => {
	const session = { store: { price_num_decimals: 2 } };
	return { useStoreSession: () => session };
});

describe('the rounding fee of a voided cash leg (#66, #84)', () => {
	const posData = (paymentRef: string) => ({
		key: '_woocommerce_pos_data',
		value: {
			amount: '0.02',
			rounding: { increment: '0.05', mode: 'nearest', payment_ref: paymentRef },
		},
	});
	// payment-0 is an older leg that failed: nothing live to void, and a failed row never counts
	// toward paid, so a fee naming it is swept like an orphan.
	const ledger = (status: string) => [
		{
			key: '_wcpos_payments',
			value: {
				schema: 1,
				payments: [
					{ id: 'payment-0', status: 'failed', capture_mode: 'manual' },
					{ id: 'payment-1', status, capture_mode: 'manual' },
				],
			},
		},
	];
	// The stored total is the store's (12.06), not what the lines add up to: the sweep moves it by
	// the dropped fee alone. A zero-balance sale's fee names no row by design (a null ref) and stays.
	const fees = [
		{
			id: 7,
			name: 'Rounding',
			total: '0.02',
			total_tax: '0.00',
			meta_data: [posData('payment-1')],
		},
		{
			name: 'Rounding',
			total: '0.01',
			total_tax: '0.00',
			meta_data: [posData(null as unknown as string)],
		},
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
		// The mirror upserts the answered row onto the latest ledger.
		mockMirror.mockImplementation(async ({ changes }: { changes: { payment: PaymentRow } }) => {
			const meta = payload.meta_data as MetaDataEntry[];
			payload = {
				...payload,
				meta_data: withLedger(meta, upsertPaymentRow(readLedger(meta), changes.payment)),
			};
			return {};
		});
	});
	afterEach(() => {
		mockStatus = 'offline';
	});
	const sweep = () => mockLocalPatch.mock.calls.map(([{ data }]) => data).find((d) => d.fee_lines);

	// ADR 0040 PR A: an offline void is not sent, so the leg and its fee both stay.
	it('offline: nothing is voided, so the fee stays with its leg', async () => {
		const { result } = renderHook(() => useVoidPayments());
		await act(async () => {
			await result.current(rounded);
		});
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(payload.fee_lines).toBe(fees);
	});

	it('online: the store voids the row, and the sweep after the mirror pushes the fee removal', async () => {
		mockStatus = 'online-website-available';
		mockPost.mockResolvedValue({
			data: {
				payment: { id: 'payment-1', status: 'voided', amount: '12.04' },
				order: { status: 'pos-open' },
			},
		});
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

	it('a sweep that cannot write after the store voided returns the void and logs its own row', async () => {
		mockStatus = 'online-website-available';
		mockPost.mockResolvedValue({
			data: {
				payment: { id: 'payment-1', status: 'voided', amount: '12.04' },
				order: { status: 'pos-open' },
			},
		});
		mockLocalPatch.mockResolvedValue(undefined);
		const { result } = renderHook(() => useVoidPayments());
		let outcome: unknown;
		await act(async () => {
			outcome = await result.current(rounded);
		});
		expect(outcome).toMatchObject({
			kind: 'voided',
			via: 'online',
			rows: [{ id: 'payment-1', status: 'voided' }],
			failed: [],
		});
		expect(mockWarn).toHaveBeenCalledTimes(1);
		expect(mockWarn).toHaveBeenCalledWith(
			'Rounding fee not removed after the void; the next void removes it',
			{ context: { orderId: 42, orderUUID: 'order-1', error: 'offline_void_local_patch_failed' } }
		);
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
		mockPost.mockRejectedValue({
			response: { status: 422, data: { code: 'wcpos_invalid_transition', message: 'no' } },
		});
		const { result } = renderHook(() => useVoidPayments());
		await act(async () => {
			await result.current(rounded);
		});
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(payload.fee_lines).toBe(fees);
	});

	it('sweeps a fee naming a row the ledger never got or a failed row, and keeps one naming a captured row', async () => {
		// The leg failed outright (no row), or failed with a row, and its unround failed too: either
		// fee is dead weight. The store refuses this void, so payment-1 stays captured with its fee.
		const orphan = { ...fees[0], id: 9, meta_data: [posData('never-recorded')] };
		const failed = { ...fees[1], total: '0.03', meta_data: [posData('payment-0')] };
		payload = { ...payload, total: '12.11', fee_lines: [...fees, orphan, failed] };
		mockStatus = 'online-website-available';
		mockPost.mockRejectedValue({
			response: { status: 422, data: { code: 'wcpos_invalid_transition', message: 'no' } },
		});
		const { result } = renderHook(() => useVoidPayments());
		await act(async () => {
			await result.current(rounded);
		});
		expect(sweep()).toEqual({
			fee_lines: [...fees, { ...orphan, name: null }],
			total: '12.06',
		});
	});

	it('leaves a null-ref fee alone when no voided row is rounded', async () => {
		payload = { ...payload, fee_lines: [fees[1]] };
		mockStatus = 'online-website-available';
		mockPost.mockResolvedValue({
			data: {
				payment: { id: 'payment-1', status: 'voided', amount: '12.04' },
				order: { status: 'pos-open' },
			},
		});
		const { result } = renderHook(() => useVoidPayments());
		await act(async () => {
			await result.current(rounded);
		});
		expect(mockMirror).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).not.toHaveBeenCalled();
	});
});

jest.mock('@wcpos/query/mutations', () => ({
	mirrorServerOrder: (manager: unknown, recordId: string, changes: unknown) =>
		mockMirror({ manager, collection: 'orders', recordId, changes }),
}));
