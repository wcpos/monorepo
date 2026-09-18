/** @jest-environment jsdom */
import * as React from 'react';

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import * as journal from './completion-journal';
import { pendingCompletions, recordCompletionAttempt } from './completion-journal';
import { SaleCompletionBridge } from './completion-journal-bridge';
import * as owner from './sale-completion';

import type { SaleContext } from './sale-completion';

const mockFind = jest.fn();
const mockRefresh = jest.fn();
const mockCatchUp = jest.fn();
const mockReceipt = jest.fn();
const mockInfo = jest.fn();
const mockDebug = jest.fn();
const mockWarn = jest.fn();
let mockStartVersion = 0;
const mockStartListeners = new Set<() => void>();
const startService = () => {
	mockStartVersion++;
	mockStartListeners.forEach((listener) => listener());
};
jest.mock('../../../../services/terminal-payments', () => ({
	getTerminalPaymentsServiceStartVersion: () => mockStartVersion,
	subscribeTerminalPaymentsServiceStart: (listener: () => void) => {
		mockStartListeners.add(listener);
		return () => mockStartListeners.delete(listener);
	},
}));
let mockManager = {};
let mockContext: SaleContext;
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => mockManager }));
jest.mock('./hooks/use-sale-context', () => ({ useSaleContext: () => mockContext }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: mockContext.storeDB }),
}));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	findEngineResident: (...args: unknown[]) => mockFind(...args),
}));
jest.mock('./hooks/reconcile-completed-order', () => ({
	reconcileCompletedOrder: (...args: unknown[]) => mockRefresh(...args),
	refreshOrderRecord: (...args: unknown[]) => mockCatchUp(...args),
}));
jest.mock('./provenance/provenance-gap', () => ({ reportProvenanceGap: jest.fn() }));
jest.mock('./checkout-mode', () => ({
	enterReceipt: (...args: unknown[]) => mockReceipt(...args),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		info: (...args: unknown[]) => mockInfo(...args),
		debug: (...args: unknown[]) => mockDebug(...args),
		warn: (...args: unknown[]) => mockWarn(...args),
	}),
}));

const resident = (uuid = 'order', status = 'completed') => ({
	uuid,
	getLatest: () => ({ payload: { id: 42, status, meta_data: [], line_items: [] } }),
});
const drain = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
addRxPlugin(RxDBLocalDocumentsPlugin);
beforeEach(async () => {
	jest.resetAllMocks();
	mockStartVersion = 0;
	mockManager = {};
	mockContext = {
		storeDB: await createRxDatabase({
			name: `bridge${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			localDocuments: true,
			multiInstance: false,
		}),
		runtime: mockManager,
		dp: 2,
	} as SaleContext;
	mockFind.mockResolvedValue(resident());
	mockCatchUp.mockResolvedValue('refreshed');
	jest.spyOn(owner, 'completeSale');
});
afterEach(async () => {
	cleanup();
	await drain();
	await mockContext.storeDB.remove();
	jest.restoreAllMocks();
});
const record = (orderUuid = 'order') =>
	recordCompletionAttempt(mockContext.storeDB, {
		orderUuid,
		source: 'terminal',
	});

it('finishes a resident completed order once in the background, marks its audit, and clears', async () => {
	await record();
	render(<SaleCompletionBridge />);
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(owner.completeSale).toHaveBeenCalledTimes(1);
	expect(owner.completeSale).toHaveBeenCalledWith(
		mockContext,
		expect.objectContaining({ uuid: 'order' }),
		{ source: 'replay' },
		{ host: 'background' }
	);
	expect(mockReceipt).toHaveBeenCalledWith('order', { select: false });
	expect(mockRefresh).toHaveBeenCalledTimes(1);
	expect(mockRefresh).toHaveBeenCalledWith(mockManager, expect.anything(), true, undefined);
	expect(mockInfo).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			context: expect.objectContaining({ type: 'checkout.completed', replayed: true }),
		})
	);
});

it.each([42, undefined])(
	'keeps an unpaid resident for two starts and clears on the third (id=%s)',
	async (id) => {
		await record();
		mockFind.mockResolvedValue({
			uuid: 'order',
			getLatest: () => ({ payload: { id, status: 'pos-open' } }),
		});
		const view = render(<SaleCompletionBridge />);
		for (const count of [1, 2]) {
			await waitFor(async () =>
				expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
					unpaidStarts: count,
				})
			);
			expect(owner.completeSale).not.toHaveBeenCalled();
			expect(mockCatchUp).toHaveBeenCalledTimes(id ? count : 0);
			expect(mockDebug).toHaveBeenLastCalledWith(
				expect.any(String),
				expect.objectContaining({ context: { orderUUID: 'order', reason: 'unpaid', count } })
			);
			mockManager = {};
			view.rerender(<SaleCompletionBridge />);
		}
		await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
		expect(mockDebug).toHaveBeenLastCalledWith(
			expect.any(String),
			expect.objectContaining({ context: { orderUUID: 'order', reason: 'unpaid', count: 3 } })
		);
		expect(owner.completeSale).not.toHaveBeenCalled();
		expect(mockRefresh).not.toHaveBeenCalled();
		expect(mockCatchUp).toHaveBeenCalledTimes(id ? 3 : 0);
	}
);

it.each([true, false])(
	'guards the third unpaid replay against a replacement during refresh (replace=%s)',
	async (replace) => {
		const timestamp = jest.spyOn(Date.prototype, 'toISOString');
		timestamp.mockReturnValue('2026-09-18T10:00:00.000Z');
		await record();
		for (let i = 0; i < 2; i++)
			await journal.failCompletionAttempt(mockContext.storeDB, 'order', 'unpaid', {
				unpaidStart: true,
			});
		mockFind.mockResolvedValue(resident('order', 'pos-open'));
		let release!: (result: string) => void;
		mockCatchUp.mockImplementationOnce(
			() =>
				new Promise<string>((resolve) => {
					release = resolve;
				})
		);
		render(<SaleCompletionBridge />);
		await waitFor(() => expect(mockCatchUp).toHaveBeenCalledTimes(1));
		if (replace) {
			timestamp.mockReturnValue('2026-09-18T11:00:00.000Z');
			await record();
		}
		await act(async () => release('refreshed'));
		await waitFor(() => expect(mockDebug).toHaveBeenCalled());
		expect(await pendingCompletions(mockContext.storeDB)).toEqual(
			replace ? { order: { source: 'terminal', at: '2026-09-18T11:00:00.000Z', attempts: 0 } } : {}
		);
		expect(owner.completeSale).not.toHaveBeenCalled();
	}
);

it('finishes on the second start when the normal pull has made the unpaid resident completed', async () => {
	await record();
	mockFind.mockResolvedValue(resident('order', 'pos-open'));
	const view = render(<SaleCompletionBridge />);
	await waitFor(() => expect(mockDebug).toHaveBeenCalled());
	expect(owner.completeSale).not.toHaveBeenCalled();
	mockFind.mockResolvedValue(resident());
	mockManager = {};
	view.rerender(<SaleCompletionBridge />);
	await waitFor(() => expect(owner.completeSale).toHaveBeenCalledTimes(1));
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(mockCatchUp).toHaveBeenCalledTimes(1);
	expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it('counts missing orders once per session and abandons with one warning on the third start', async () => {
	await record();
	mockFind.mockResolvedValue(null);
	const view = render(<SaleCompletionBridge />);
	for (const attempts of [1, 2]) {
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
				attempts,
				missingStarts: attempts,
				lastError: 'order_not_resident',
			})
		);
		expect(mockWarn).not.toHaveBeenCalled();
		mockManager = {};
		view.rerender(<SaleCompletionBridge />);
	}
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(mockFind).toHaveBeenCalledTimes(3);
	expect(mockWarn).toHaveBeenCalledTimes(1);
	expect(mockWarn).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			code: ERROR_CODES.PAYMENT_CAPTURED_ORDER_UNFINISHED,
			context: expect.objectContaining({
				type: 'checkout.order-refresh',
				reason: 'completion-abandoned',
				orderUUID: 'order',
			}),
		})
	);
	expect(owner.completeSale).not.toHaveBeenCalled();
});

it('does nothing and makes no request for an empty journal', async () => {
	render(<SaleCompletionBridge />);
	await drain();
	expect(mockFind).not.toHaveBeenCalled();
	expect(owner.completeSale).not.toHaveBeenCalled();
	expect(mockRefresh).not.toHaveBeenCalled();
});

it('makes no second request when a replacement session starts with the cleared journal', async () => {
	await record();
	const view = render(<SaleCompletionBridge />);
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	mockManager = {};
	view.rerender(<SaleCompletionBridge />);
	await drain();
	expect(mockFind).toHaveBeenCalledTimes(1);
	expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it('stays sequential across context changes and StrictMode effect restarts, without replaying twice', async () => {
	await record();
	await record('other');
	mockFind.mockImplementation(async (_manager, _collection, uuid) => resident(uuid));
	let release!: () => void;
	mockRefresh.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			})
	);
	const view = render(
		<React.StrictMode>
			<SaleCompletionBridge />
		</React.StrictMode>
	);
	await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
	mockContext = { ...mockContext };
	view.rerender(
		<React.StrictMode>
			<SaleCompletionBridge />
		</React.StrictMode>
	);
	await drain();
	expect(mockFind).toHaveBeenCalledTimes(1);
	await act(async () => release());
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(mockRefresh).toHaveBeenCalledTimes(2);
	await record('new-attempt');
	mockContext = { ...mockContext };
	view.rerender(
		<React.StrictMode>
			<SaleCompletionBridge />
		</React.StrictMode>
	);
	await drain();
	expect(mockFind).toHaveBeenCalledTimes(2);
	expect((await pendingCompletions(mockContext.storeDB))['new-attempt']).toBeDefined();
});

it('does not finish a lookup that resolves after the bridge stopped', async () => {
	await record();
	let release!: (value: ReturnType<typeof resident>) => void;
	mockFind.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				release = resolve;
			})
	);
	const view = render(<SaleCompletionBridge />);
	await waitFor(() => expect(mockFind).toHaveBeenCalledTimes(1));
	view.unmount();
	await act(async () => release(resident()));
	expect(owner.completeSale).not.toHaveBeenCalled();
	expect((await pendingCompletions(mockContext.storeDB)).order).toBeDefined();
});

it('retains a failed completion without an in-session retry and continues with the next order', async () => {
	await record();
	await record('other');
	mockFind.mockImplementation(async (_manager, _collection, uuid) => resident(uuid));
	mockRefresh.mockRejectedValueOnce(new Error('finish failed'));
	const view = render(<SaleCompletionBridge />);
	await waitFor(async () =>
		expect(Object.keys(await pendingCompletions(mockContext.storeDB))).toEqual(['order'])
	);
	expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
		attempts: 1,
		lastError: 'finish failed',
	});
	mockContext = { ...mockContext };
	view.rerender(<SaleCompletionBridge />);
	await drain();
	expect(owner.completeSale).toHaveBeenCalledTimes(2);
	mockManager = {};
	view.rerender(<SaleCompletionBridge />);
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(owner.completeSale).toHaveBeenCalledTimes(3);
});

it('catches up an open resident before replay and never requests a second refresh', async () => {
	await record();
	let status = 'pos-open';
	mockFind.mockResolvedValue({
		uuid: 'order',
		getLatest: () => ({ payload: { id: 42, status, meta_data: [], line_items: [] } }),
	});
	mockCatchUp.mockImplementationOnce(async () => {
		status = 'completed';
		return 'refreshed';
	});
	render(<SaleCompletionBridge />);
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(owner.completeSale).toHaveBeenCalledTimes(1);
	expect(mockCatchUp).toHaveBeenCalledTimes(1);
	expect(mockCatchUp).toHaveBeenCalledWith(mockManager, 42);
	expect(mockRefresh).toHaveBeenCalledWith(mockManager, expect.anything(), false, undefined);
	expect(mockInfo).toHaveBeenCalledTimes(1);
});

it.each(['timed-out', 'rejected'] as const)(
	'retains an open resident when catch-up is %s',
	async (failure) => {
		await record();
		mockFind.mockResolvedValue(resident('order', 'pos-open'));
		if (failure === 'timed-out') mockCatchUp.mockResolvedValueOnce('timed-out');
		else mockCatchUp.mockRejectedValueOnce(new Error('refresh rejected'));
		render(<SaleCompletionBridge />);
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
				attempts: 1,
				lastError: failure === 'timed-out' ? 'completion_refresh_timed_out' : 'refresh rejected',
			})
		);
		expect(owner.completeSale).not.toHaveBeenCalled();
		expect(mockCatchUp).toHaveBeenCalledTimes(1);
	}
);

it('does not abandon the first missing lookup after two finish failures', async () => {
	await record();
	mockRefresh.mockRejectedValue(new Error('finish failed'));
	for (let i = 0; i < 2; i++) {
		await expect(
			owner.completeSale(
				mockContext,
				resident() as never,
				{ source: 'replay' },
				{ host: 'background' }
			)
		).rejects.toThrow('finish failed');
	}
	mockFind.mockResolvedValue(null);
	render(<SaleCompletionBridge />);
	await waitFor(() => expect(mockFind).toHaveBeenCalledTimes(1));
	await drain();
	expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
		attempts: 3,
		missingStarts: 1,
		lastError: 'order_not_resident',
	});
	expect(mockWarn).not.toHaveBeenCalled();
});

it('clears a cancelled contract attempt without completing, receipt, or audit', async () => {
	await owner.prepareSale(mockContext, {
		order: resident('order', 'pos-open') as never,
		completing: true,
		source: 'gateway-contract',
		bindingStatus: 'none',
		sessionRule: 'none',
	});
	mockFind.mockResolvedValue(resident('order', 'cancelled'));
	render(<SaleCompletionBridge />);
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(owner.completeSale).not.toHaveBeenCalled();
	expect(mockReceipt).not.toHaveBeenCalled();
	expect(mockInfo).not.toHaveBeenCalled();
	expect(mockDebug).toHaveBeenCalled();
	expect(mockCatchUp).not.toHaveBeenCalled();
});

it.each([{ id: 'A', name: 'Cashier A' }, undefined])(
	'replays the recorded actor %j, never the reopening cashier',
	async (actor) => {
		await owner.prepareSale(
			{ ...mockContext, actor },
			{
				order: resident() as never,
				completing: true,
				source: 'gateway-contract',
				bindingStatus: 'none',
				sessionRule: 'none',
			}
		);
		mockContext = { ...mockContext, actor: { id: 'B', name: 'Cashier B' } };
		render(<SaleCompletionBridge />);
		await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
		expect(mockInfo).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ actor }));
	}
);

it('replays again when the service starts with the same database and runtime', async () => {
	await record();
	mockRefresh.mockRejectedValueOnce(new Error('finish failed'));
	render(<SaleCompletionBridge />);
	await waitFor(async () =>
		expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({ attempts: 1 })
	);
	expect(owner.completeSale).toHaveBeenCalledTimes(1);
	act(startService);
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(owner.completeSale).toHaveBeenCalledTimes(2);
});

it('reads the service version in the effect after the preceding bridge starts, without a second run', async () => {
	function StartingBridge() {
		React.useEffect(startService, []);
		return null;
	}
	await record();
	const readPending = jest.spyOn(journal, 'pendingCompletions');
	render(
		<>
			<StartingBridge />
			<SaleCompletionBridge />
		</>
	);
	await waitFor(() => expect(mockInfo).toHaveBeenCalledTimes(1));
	await drain();
	expect(readPending).toHaveBeenCalledTimes(1);
	expect(owner.completeSale).toHaveBeenCalledTimes(1);
});
