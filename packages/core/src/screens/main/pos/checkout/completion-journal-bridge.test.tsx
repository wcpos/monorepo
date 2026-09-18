/** @jest-environment jsdom */
import * as React from 'react';

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { pendingCompletions, recordCompletionAttempt } from './completion-journal';
import { SaleCompletionBridge } from './completion-journal-bridge';
import * as owner from './sale-completion';

import type { SaleContext } from './sale-completion';

const mockFind = jest.fn();
const mockRefresh = jest.fn();
const mockReceipt = jest.fn();
const mockInfo = jest.fn();
const mockDebug = jest.fn();
const mockWarn = jest.fn();
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

it('clears an unpaid resident with a debug row, without completing or refreshing', async () => {
	await record();
	mockFind.mockResolvedValue(resident('order', 'pos-open'));
	render(<SaleCompletionBridge />);
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(mockDebug).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({ context: expect.objectContaining({ orderUUID: 'order' }) })
	);
	expect(owner.completeSale).not.toHaveBeenCalled();
	expect(mockRefresh).not.toHaveBeenCalled();
});

it('counts missing orders once per session and abandons with one warning on the third start', async () => {
	await record();
	mockFind.mockResolvedValue(null);
	const view = render(<SaleCompletionBridge />);
	for (const attempts of [1, 2]) {
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
				attempts,
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
