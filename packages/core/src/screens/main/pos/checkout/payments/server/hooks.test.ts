/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { readLedger, withLedger } from '@wcpos/order-math';
import type { PaymentRow } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import {
	getTerminalPaymentsService,
	startTerminalPaymentsService,
	stopTerminalPaymentsService,
} from '../../../../../../services/terminal-payments';
import { useTerminalPaymentsService } from './use-terminal-payments-service';
import { useTerminalLeg } from './use-terminal-leg';
import { useResumeTerminalLegs, useResumeTerminalLegsForOrders } from './use-resume-terminal-legs';

const mockManager = { engine: { db$: () => () => {} } };
let mockSession = { store: { id: 1 }, site: { id: 1 } };
const mockFind = jest.fn();
const mockPatch = jest.fn();
const mockReceipt = jest.fn();
let mockHttp = { get: jest.fn(), post: jest.fn() };
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../../../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ methods: [] }),
}));
jest.mock('@wcpos/query', () => ({
	engineCollection: () => null,
	useQueryRuntime: () => mockManager,
	useRecordField: (
		record: EngineRecord<'orders'> | undefined,
		select: (record: EngineRecord<'orders'>) => unknown
	) => (record ? select(record) : undefined),
}));
jest.mock('../../../../../../contexts/app-state', () => ({ useStoreSession: () => mockSession }));
jest.mock('../../../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => mockHttp }));
jest.mock('../../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockPatch }),
	findEngineResident: (...args: unknown[]) => mockFind(...args),
	patchEngineResident: (...args: unknown[]) => mockPatch(...args),
}));
jest.mock('../../checkout-mode', () => ({
	subscribeCheckoutMode: () => () => {},
	getOrderSaveState: () => null,
	enterReceipt: (...args: unknown[]) => mockReceipt(...args),
}));
// The hooks only inspect ledger identity/status, not monetary row fields.
const row = {
	id: 'leg',
	status: 'pending',
	capture_mode: 'server',
	created_at_gmt: '2026-01-01T00:00:00Z',
} as PaymentRow;
const summary = {
	status: 'completed',
	total: '10',
	paid: '10',
	balance: '0.00',
	payment_method: 'terminal',
	payment_method_title: 'Terminal',
};
const record = (uuid: string, rows = [row]) =>
	({
		uuid,
		payload: { id: 42, number: '42', meta_data: withLedger([], rows) },
	}) as EngineRecord<'orders'>;
beforeEach(() => {
	jest.useFakeTimers();
	jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
	jest.clearAllMocks();
	mockSession = { store: { id: 1 }, site: { id: 1 } };
	mockHttp = {
		get: jest.fn(async () => ({
			data: { payment: { ...row, status: 'captured' }, order: summary },
		})),
		post: jest.fn(),
	};
	mockFind.mockResolvedValue({ payload: { meta_data: [{ key: 'other', value: 7 }] } });
	mockPatch.mockResolvedValue({});
});
afterEach(() => {
	stopTerminalPaymentsService();
	jest.clearAllTimers();
	jest.useRealTimers();
});
it.each(['0.00', '4.00'])(
	'mirrors authoritative rows and summary, entering receipt only at zero (%s)',
	async (balance) => {
		const view = renderHook(() => useTerminalPaymentsService());
		mockHttp.get.mockResolvedValue({
			data: { payment: { ...row, status: 'captured' }, order: { ...summary, balance } },
		});
		getTerminalPaymentsService()!.resume({
			orderUuid: 'order',
			orderId: 42,
			orderNumber: '42',
			row,
		});
		await act(() => jest.advanceTimersByTimeAsync(0));
		expect(mockFind).toHaveBeenCalledWith(mockManager, 'orders', 'order');
		const changes = mockPatch.mock.calls[0][0].changes;
		expect(changes.status).toBe('completed');
		expect(changes.meta_data[0]).toEqual({ key: 'other', value: 7 });
		expect(readLedger(changes.meta_data)).toEqual([{ ...row, status: 'captured' }]);
		expect(mockReceipt.mock.calls).toEqual(
			balance === '0.00' ? [['order', { select: false }]] : []
		);
		view.unmount();
		expect(getTerminalPaymentsService()).toBeNull();
	}
);
it('HTTP refresh keeps a leg alive; store change replaces the singleton and stops old timers', async () => {
	const view = renderHook(() => useTerminalPaymentsService());
	const first = getTerminalPaymentsService()!;
	first.resume({ orderUuid: 'order', orderId: 42, orderNumber: '42', row });
	mockHttp = { get: jest.fn(async () => ({ data: { payment: row } })), post: jest.fn() };
	view.rerender();
	expect(getTerminalPaymentsService()).toBe(first);
	await act(() => jest.advanceTimersByTimeAsync(0));
	expect(mockHttp.get).toHaveBeenCalledTimes(1);
	mockSession = { ...mockSession, store: { id: 2 } };
	view.rerender();
	expect(getTerminalPaymentsService()).not.toBe(first);
	await act(() => jest.advanceTimersByTimeAsync(10000));
	expect(mockHttp.get).toHaveBeenCalledTimes(1);
	view.unmount();
});

describe('background capture reconciliation', () => {
	const requireRefresh = jest.fn();
	const resident = {
		...record('background-order'),
		getLatest: () => ({ payload: { id: 42, line_items: [] } }),
	};

	beforeEach(() => {
		Object.assign(mockManager, { engine: { ...mockManager.engine, require: requireRefresh } });
		requireRefresh.mockReturnValue({ ready: Promise.resolve(), release: jest.fn() });
	});

	it('refreshes a captured resident without selecting it', async () => {
		mockFind.mockResolvedValue(resident);
		const view = renderHook(() => useTerminalPaymentsService());
		getTerminalPaymentsService()!.resume({
			orderUuid: 'background-order',
			orderId: 42,
			orderNumber: '42',
			row,
		});
		await act(() => jest.advanceTimersByTimeAsync(0));

		expect(mockReceipt).toHaveBeenCalledWith('background-order', { select: false });
		expect(requireRefresh).toHaveBeenCalledWith({
			id: 'checkout:order-refresh:42',
			collection: 'orders',
			kind: 'targeted-records',
			remoteIds: ['42'],
			forceRefresh: true,
		});
		expect(mockReceipt.mock.invocationCallOrder[0]).toBeLessThan(
			requireRefresh.mock.invocationCallOrder[0]
		);
		expect(requireRefresh.mock.results[0].value.release).toHaveBeenCalledTimes(1);
		view.unmount();
	});

	it.each(['missing resident', 'remaining balance'])(
		'does not reconcile with %s',
		async (scenario) => {
			mockFind.mockResolvedValueOnce(resident).mockResolvedValue(null);
			if (scenario === 'remaining balance') {
				mockHttp.get.mockResolvedValue({
					data: { payment: { ...row, status: 'captured' }, order: { ...summary, balance: '4' } },
				});
			}
			const view = renderHook(() => useTerminalPaymentsService());
			getTerminalPaymentsService()!.resume({
				orderUuid: 'background-order',
				orderId: 42,
				orderNumber: '42',
				row,
			});
			await act(() => jest.advanceTimersByTimeAsync(0));
			expect(requireRefresh).not.toHaveBeenCalled();
			expect(mockFind).toHaveBeenCalledTimes(scenario === 'missing resident' ? 2 : 1);
			view.unmount();
		}
	);

	it('catches and warns when reconciliation rejects', async () => {
		mockFind.mockResolvedValue(resident);
		requireRefresh.mockImplementationOnce(() => {
			throw new Error('engine unavailable');
		});
		const view = renderHook(() => useTerminalPaymentsService());
		getTerminalPaymentsService()!.resume({
			orderUuid: 'background-order',
			orderId: 42,
			orderNumber: '42',
			row,
		});
		await act(() => jest.advanceTimersByTimeAsync(0));
		expect(requireRefresh).toHaveBeenCalledTimes(1);
		expect(jest.requireActual('@wcpos/utils/logger').warn).toHaveBeenCalledWith(
			expect.any(String),
			{ context: { orderId: 'background-order', error: 'engine unavailable' } }
		);
		view.unmount();
	});
});
it('cold subscribers see service start, changes and stop; both resume hooks track only live server rows', async () => {
	const orders = [
		record('one'),
		record('two', [{ ...row, id: 'two', status: 'authorized' }]),
		record('manual', [{ ...row, capture_mode: 'manual' }]),
		record('settled', [{ ...row, status: 'captured' }]),
	];
	const view = renderHook(() => {
		useResumeTerminalLegs(orders[0]);
		useResumeTerminalLegsForOrders(orders);
		return useTerminalLeg('one');
	});
	expect(view.result.current).toBeNull();
	let service!: ReturnType<typeof startTerminalPaymentsService>;
	act(() => {
		service = startTerminalPaymentsService({ http: mockHttp, mirror: async () => {} });
	});
	expect(service.getSnapshot().size).toBe(2);
	expect(view.result.current?.phase).toBe('polling');
	view.rerender();
	expect(service.getSnapshot().size).toBe(2);
	await act(() => jest.advanceTimersByTimeAsync(0));
	expect(view.result.current?.outcome).toBe('captured');
	expect(mockHttp.post).not.toHaveBeenCalled();
	act(() => stopTerminalPaymentsService());
	expect(view.result.current).toBeNull();
	view.unmount();
});

jest.mock('../../provenance/stamp-completion', () => ({
	completionMeta: async ({ meta_data }: { meta_data: unknown[] }) => [
		...meta_data,
		{ key: '_wcpos_sale_counter', value: '1' },
	],
}));
