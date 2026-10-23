import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import {
	type MetaDataEntry,
	type OrderPaymentSummary,
	withAwaitingCustomer,
	withLedger,
} from '@wcpos/order-math';
import {
	pendingCompletions,
	recordCompletionAttempt,
	resolveCompletionAttempt,
} from '@wcpos/query/store-local';
import * as journal from '@wcpos/query/store-local';

import { createDispatchToken } from '../../../../extensions/actions/registry';
import * as mutationQueue from '../hooks/order-mutation-queue';
import * as actions from '../../../../extensions/actions/dispatch';
import { CHECKOUT_COMPLETE_EVENT, createActionContext } from '../../../../extensions/actions';
import { row } from './payments/device/fixtures.test-utils';
import {
	completeSale,
	completionMetaFor,
	isSaleComplete,
	isSettledOrderStatus,
	persistSaleProvenance,
	recordSaleAttempt,
} from './sale-completion';
import {
	claimReceiptAutoPrint,
	enterCheckout,
	getCheckoutModeSnapshot,
	resetCheckoutMode,
	resolveStage,
} from './checkout-mode';

import type { SaleContext, SaleOutcome } from './sale-completion';

const mockBound = jest.fn(),
	mockSession = jest.fn(),
	mockStamp = jest.fn(),
	mockGap = jest.fn(),
	mockReconcile = jest.fn(),
	mockRefresh = jest.fn(),
	mockDebug = jest.fn(),
	mockReceipt = jest.fn(),
	mockAnswerAdopted = jest.fn(),
	mockInfo = jest.fn();
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	answerAdopted: (...args: unknown[]) => mockAnswerAdopted(...args),
}));
jest.mock('@wcpos/query/register-session', () => ({
	readBoundRegister: (...args: unknown[]) => mockBound(...args),
	readRegister: async () => ({ sites: { site: { register_id: 'register-A' } } }),
	nextSaleCounter: async () => 7,
	requireOpenSession: (...args: unknown[]) => mockSession(...args),
}));
jest.mock('./provenance/stamp-completion', () => ({
	completionMeta: (...args: unknown[]) => mockStamp(...args),
}));
jest.mock('./provenance/provenance-gap', () => ({
	reportProvenanceGap: (...args: unknown[]) => mockGap(...args),
}));
jest.mock('./hooks/reconcile-completed-order', () => ({
	reconcileCompletedOrder: (...args: unknown[]) => mockReconcile(...args),
	refreshOrderRecord: (...args: unknown[]) => mockRefresh(...args),
}));
jest.mock('./checkout-mode', () => {
	const actual = jest.requireActual('./checkout-mode');
	return {
		...actual,
		// The sale's tab is open (a replay refreshes only an open tab, ADR 0040 D1 rule 3).
		getCheckoutModeSnapshot: () => {
			const mode = actual.getCheckoutModeSnapshot();
			return { ...mode, checkoutOrders: new Set([...mode.checkoutOrders, 'order']) };
		},
		enterReceipt: (...args: unknown[]) => mockReceipt(...args),
	};
});
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		info: (...args: unknown[]) => mockInfo(...args),
		debug: (...args: unknown[]) => mockDebug(...args),
	}),
}));
const payload = { id: 42, status: 'completed', meta_data: [], line_items: [] };
const order = { uuid: 'order', getLatest: () => ({ payload }) } as never;
const mockActionLog = jest.fn();
const mockPatch = jest.fn<
	ReturnType<SaleContext['stampCompletion']>,
	[{ document: unknown; data: { meta_data: MetaDataEntry[] } }]
>();
const ctx = {
	actionCtx: createActionContext({
		log: mockActionLog,
		t: (key) => key,
		readCatalog: async () => null,
		readPaymentMethod: () => null,
		preventOverselling: false,
		priceDecimals: 2,
		resolveSession: async () => ({ registerId: null, sessionId: null }),
	}),
	actionActor: { userId: 7, registerId: 'register', sessionId: null },
	userDB: {},
	siteUuid: 'site',
	storeId: 1,
	sessionsOn: true,
	sessions: {},
	runtime: {},
	dp: 2,
	stampCompletion: (o: Parameters<SaleContext['stampCompletion']>[0], m: MetaDataEntry[]) =>
		mockPatch({ document: o, data: { meta_data: m } }),
	pushDocument: jest.fn(),
	stockAdjustment: jest.fn(),
} as unknown as SaleContext;
const manual = {
	source: 'manual',
	via: 'online',
	row,
	order: null,
	mirrorFailed: false,
	remainingMinor: 0,
} as const;
const sent = {
	source: 'gateway',
	order: {
		status: 'pending',
		total: '92.95',
		paid: '0.00',
		balance: '92.95',
		authorized: '0.00',
		refund_due: '0.00',
		refund_pending: '0.00',
		payment_method: 'wcpos_email_invoice',
		payment_method_title: 'Email Invoice',
	},
	stamp: {
		method_id: 'wcpos_email_invoice',
		destination: 'buyer@example.com',
		attempt_id: 'attempt-1',
		sent_at_gmt: '2026-10-08T10:00:00.000Z',
		cashier_id: 7,
	},
} as const;
addRxPlugin(RxDBLocalDocumentsPlugin);
afterEach(async () => {
	await ctx.storeDB.remove();
});
beforeEach(async () => {
	resetCheckoutMode();
	ctx.storeDB = await createRxDatabase({
		name: `owner${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	});
	jest.clearAllMocks();
	mockActionLog.mockImplementation((_level, message, options) => {
		const { category: _category, ...rest } = options ?? {};
		mockInfo(message, rest);
	});
	mockRefresh.mockReset();
	mockAnswerAdopted.mockResolvedValue(false);
	mockReconcile.mockResolvedValue('refreshed');
	mockBound.mockResolvedValue({ id: 'register' });
	mockSession.mockResolvedValue('session');
	mockStamp.mockResolvedValue([{ key: 'stamp', value: 1 }]);
	jest.mocked(mockPatch).mockResolvedValue(order);
});
it.each([
	['manual online prediction', manual, true],
	['manual online partial prediction without summary', { ...manual, remainingMinor: 50 }, false],
	['manual offline prediction', { ...manual, via: 'offline', remainingMinor: 50 }, false],
	['manual offline full prediction', { ...manual, via: 'offline' }, true],
	[
		'manual online non-zero summary overrides a paid prediction',
		{ ...manual, order: { balance: '1.00' } },
		false,
	],
	[
		'manual online zero summary overrides an unpaid prediction',
		{ ...manual, remainingMinor: 50, order: { balance: '0.00' } },
		true,
	],
	['manual mirror recovery', { ...manual, mirrorFailed: true, order: { balance: '1.00' } }, false],
	[
		'manual mirror recovery with zero summary',
		{ ...manual, mirrorFailed: true, remainingMinor: 50, order: { balance: '0.00' } },
		true,
	],
	[
		'manual mirror recovery without summary is never complete (no evidence either side)',
		{ ...manual, mirrorFailed: true },
		false,
	],
	['terminal summary', { source: 'terminal', row, order: { balance: '0.00' } }, true],
	['terminal fallback', { source: 'terminal', row, order: null, balance: '0.00' }, true],
	['contract exact status', { source: 'gateway-contract', status: 'on-hold' }, false],
	[
		'snapshot on-hold',
		{ source: 'gateway-snapshot', snapshot: { ...payload, status: 'on-hold' } },
		true,
	],
	['zero balance', { source: 'zero-balance', order: { status: 'completed' } }, true],
	['zero balance reopened', { source: 'zero-balance', order: { status: 'pos-open' } }, false],
	[
		'gateway sent is never paid',
		{ source: 'gateway', order: sent.order, stamp: sent.stamp },
		false,
	],
	// The store judged the stored status reached (§3.1); the summary's balance is still due.
	['gateway settled is a finished sale', { source: 'gateway-settled', order: sent.order }, true],
] as [string, SaleOutcome, boolean][])('%s', (_, outcome, expected) =>
	expect(isSaleComplete(outcome, 2)).toBe(expected)
);
// A captured leg that covers the balance completes the order on the store, so a store answer at
// a zero balance whose order is open again was reopened since (another till): the first answer,
// an automatic re-send and Try again alike never finish that sale. A till-derived summary (an
// offline leg) carries no store status and is judged by its balance as before.
const reopened = { status: 'pos-open', balance: '0.00' } as OrderPaymentSummary;
it.each([
	['a manual store answer', { ...manual, remainingMinor: 50, order: reopened }, false],
	['a terminal store answer', { source: 'terminal', row, order: reopened }, false],
	[
		'an offline terminal leg',
		{ source: 'terminal', row: { ...row, recorded_offline: true }, order: reopened },
		true,
	],
	[
		'a manual store answer that completed the sale',
		{ ...manual, remainingMinor: 50, order: { ...reopened, status: 'completed' } },
		true,
	],
] as [string, SaleOutcome, boolean][])(
	'a reopened sale at a zero balance: %s',
	(_, outcome, done) => expect(isSaleComplete(outcome, 2)).toBe(done)
);
it.each([
	['pending at the stored status settles', 'pending', 'pending', [], true],
	['pending with no stored status is unpaid', 'pending', undefined, [], false],
	['pending with another stored status is unpaid', 'pending', 'on-hold', [], false],
	['a stored status never settles a stamped order', 'pending', 'pending', [sent.stamp], false],
	['on-hold settles whatever is stored', 'on-hold', 'pending', [], true],
	['pos-open never settles, even stored', 'pos-open', 'pos-open', [], false],
	['pos-partial never settles, even stored', 'pos-partial', 'pos-partial', [], false],
	['failed never settles, even stored', 'failed', 'failed', [], false],
	['cancelled never settles, even stored', 'cancelled', 'cancelled', [], false],
] as const)('replay: %s', (_, status, settledOrderStatus, stamps, expected) => {
	const resident = {
		...payload,
		status,
		meta_data: stamps.flatMap((value) => withAwaitingCustomer([], value)),
	};
	expect(
		isSaleComplete(
			{ source: 'replay', ...(settledOrderStatus ? { settledOrderStatus } : {}) },
			2,
			resident as never
		)
	).toBe(expected);
});
it.each([
	['the entry for the gateway the order carries settles it', 'bacs', true],
	["another gateway's entry never does", 'pos_card', false],
	['an order carrying no gateway is judged with nothing stored', undefined, false],
] as const)('replay with a journaled catalog: %s', (_, method, expected) => {
	const resident = { ...payload, status: 'pending', payment_method: method, meta_data: [] };
	expect(
		isSaleComplete(
			{
				source: 'replay',
				settledOrderStatuses: { pos_cash: null, bacs: 'pending', pos_card: null },
			},
			2,
			resident as never
		)
	).toBe(expected);
});
it.each(['pos-open', 'pos-partial', 'pending', 'failed', 'cancelled', 'refunded', 'trash'])(
	'snapshot excludes %s',
	(status) =>
		expect(
			isSaleComplete({ source: 'gateway-snapshot', snapshot: { ...payload, status } as never }, 2)
		).toBe(false)
);
// A server row with no status proves nothing: a plugin filter's `{}`, `{ status: '' }`, or the first
// character of a non-JSON 200 body read as `data[0]`. None of them settles the sale, even with a
// stored gateway status in the catalog.
it.each([
	['missing', { ...payload, status: undefined }],
	['empty', { ...payload, status: '' }],
	['blank', { ...payload, status: '  ' }],
	['a string character', '<'],
	['null', null],
])('snapshot with %s status never settles', (_name, snapshot) => {
	expect(
		isSaleComplete({ source: 'gateway-snapshot', snapshot, settledOrderStatus: '' } as never, 2)
	).toBe(false);
	expect(isSaleComplete({ source: 'gateway-snapshot', snapshot } as never, 2)).toBe(false);
});
it('online provenance stamps, patches, then awaits push', async () => {
	let release!: () => void;
	jest.mocked(ctx.pushDocument).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				release = () => resolve(undefined as never);
			})
	);
	let finished = false;
	const pending = persistSaleProvenance(ctx, { order, sessionId: 'session', online: true }).then(
		() => {
			finished = true;
		}
	);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(mockStamp.mock.invocationCallOrder[0]).toBeLessThan(
		jest.mocked(mockPatch).mock.invocationCallOrder[0]
	);
	expect(jest.mocked(mockPatch).mock.invocationCallOrder[0]).toBeLessThan(
		jest.mocked(ctx.pushDocument).mock.invocationCallOrder[0]
	);
	expect(finished).toBe(false);
	release();
	await pending;
});
it('offline provenance writes split only', async () => {
	const extraMeta = [{ key: '_wcpos_split', value: 'plan' }];
	await persistSaleProvenance(ctx, { order, sessionId: null, online: false, extraMeta });
	expect(mockPatch).toHaveBeenCalledWith({ document: order, data: { meta_data: extraMeta } });
	expect(mockStamp).not.toHaveBeenCalled();
	expect(ctx.pushDocument).not.toHaveBeenCalled();
});
it('returns metadata for the caller atomic write', async () => {
	expect(
		await completionMetaFor(ctx, [], {
			sessionId: 'session',
			extraMeta: [{ key: 'stamp', value: 2 }],
		})
	).toEqual([{ key: 'stamp', value: 2 }]);
	expect(mockPatch).not.toHaveBeenCalled();
	expect(ctx.pushDocument).not.toHaveBeenCalled();
});
it.each([
	[manual, true],
	[{ ...manual, via: 'offline' }, false],
	[{ source: 'terminal', row, order: { balance: '0' } }, !row.recorded_offline],
	[{ source: 'terminal', row: { ...row, recorded_offline: true }, order: { balance: '0' } }, false],
	[{ source: 'gateway-contract', status: 'completed' }, true],
	[{ source: 'gateway-settled', order: sent.order }, true],
	[{ source: 'gateway-snapshot', snapshot: payload }, false],
	[{ source: 'zero-balance', order: { status: 'completed' } }, false],
] as [SaleOutcome, boolean][])('refresh and gap rule %j', async (outcome, refresh) => {
	expect(await completeSale(ctx, order, outcome, { host: 'modal' })).toBe('completed');
	expect(mockGap).toHaveBeenCalledTimes(1);
	if (outcome.source !== 'gateway-snapshot')
		expect(mockReconcile).toHaveBeenCalledWith(ctx.runtime, order, refresh, ctx.stockAdjustment);
	else {
		expect(mockReconcile).not.toHaveBeenCalled();
		expect(ctx.stockAdjustment).toHaveBeenCalledWith([]);
	}
	expect(mockActionLog).toHaveBeenCalledTimes(1);
	if (refresh)
		expect(mockGap.mock.invocationCallOrder[0]).toBeLessThan(
			mockReconcile.mock.invocationCallOrder[0]
		);
});
describe("the poster's post-answer adoption stands in for the completion's refresh", () => {
	const settled = [
		manual,
		{ source: 'terminal', row: { ...row, recorded_offline: false }, order: { balance: '0' } },
		{ source: 'gateway-settled', order: sent.order },
	] as SaleOutcome[];
	it.each(settled)('%j: no second whole-order read, stock still reconciled', async (outcome) => {
		const { reconcileCompletedOrder } = jest.requireActual('./hooks/reconcile-completed-order');
		mockReconcile.mockImplementationOnce(reconcileCompletedOrder);
		mockAnswerAdopted.mockResolvedValue(true);
		expect(await completeSale(ctx, order, outcome, { host: 'modal' })).toBe('completed');
		expect(mockAnswerAdopted).toHaveBeenCalledWith(ctx.runtime, ctx.storeDB, 'order');
		expect(mockReconcile).toHaveBeenCalledWith(ctx.runtime, order, false, ctx.stockAdjustment);
		await expect(mockReconcile.mock.results[0].value).resolves.toBe('skipped');
		expect(mockRefresh).not.toHaveBeenCalled();
		expect(ctx.stockAdjustment).toHaveBeenCalledWith([]);
	});
	it.each(settled)(
		'%j: refreshes as before when the resident does not hold the answer',
		async (outcome) => {
			expect(await completeSale(ctx, order, outcome, { host: 'modal' })).toBe('completed');
			expect(mockReconcile).toHaveBeenCalledTimes(1);
			expect(mockReconcile).toHaveBeenCalledWith(ctx.runtime, order, true, ctx.stockAdjustment);
		}
	);
	it('refreshes when the resident cannot be read', async () => {
		mockAnswerAdopted.mockRejectedValue(new Error('Engine resident "order" is missing'));
		expect(await completeSale(ctx, order, manual, { host: 'modal' })).toBe('completed');
		expect(mockReconcile).toHaveBeenCalledWith(ctx.runtime, order, true, ctx.stockAdjustment);
	});
	it.each([
		[{ source: 'replay', refreshed: false }],
		[{ source: 'gateway-contract', status: 'completed' }],
	] as [SaleOutcome][])('%j refreshes whatever the resident holds', async (outcome) => {
		mockAnswerAdopted.mockResolvedValue(true);
		await completeSale(ctx, order, outcome, { host: 'modal' });
		expect(mockAnswerAdopted).not.toHaveBeenCalled();
		expect(mockReconcile).toHaveBeenCalledTimes(1);
		expect(mockReconcile).toHaveBeenCalledWith(ctx.runtime, order, true, ctx.stockAdjustment);
	});
});
it.each([
	[{ host: 'stage', autoShowReceipt: true }, ['order']],
	[{ host: 'stage', autoShowReceipt: false }, null],
	[{ host: 'modal' }, null],
	[{ host: 'background' }, ['order', { select: false }]],
] as const)('presentation %j precedes refresh', async (presentation, args) => {
	await completeSale(ctx, order, manual, presentation);
	if (args) {
		expect(mockReceipt).toHaveBeenCalledWith(...args);
		expect(mockReceipt.mock.invocationCallOrder[0]).toBeLessThan(
			mockGap.mock.invocationCallOrder[0]
		);
	} else expect(mockReceipt).not.toHaveBeenCalled();
});
it('does not finish partial or unpaid sales', async () => {
	expect(
		await completeSale(ctx, order, { ...manual, remainingMinor: 50 }, { host: 'background' })
	).toBe('partial');
	expect(
		await completeSale(
			ctx,
			order,
			{ source: 'gateway-contract', status: 'failed' },
			{ host: 'modal' }
		)
	).toBe('not-completed');
	expect(mockGap).not.toHaveBeenCalled();
	expect(mockReceipt).not.toHaveBeenCalled();
	expect(mockInfo).not.toHaveBeenCalled();
});
it('a sent sale leaves the till: sent moment, store refresh, checkout.sent row, attempt resolved', async () => {
	await recordCompletionAttempt(ctx.storeDB, { orderUuid: 'order', source: 'gateway' });
	mockRefresh.mockResolvedValue('refreshed');
	expect(await completeSale(ctx, order, sent, { host: 'stage', autoShowReceipt: true })).toBe(
		'sent'
	);
	expect(mockReceipt).toHaveBeenCalledWith('order');
	expect(mockRefresh).toHaveBeenCalledWith(ctx.runtime, 42);
	expect(mockReconcile).not.toHaveBeenCalled();
	expect(mockInfo).toHaveBeenCalledWith(
		expect.stringContaining('sent to the customer'),
		expect.objectContaining({
			context: expect.objectContaining({
				type: 'checkout.sent',
				orderId: 42,
				destination: 'buyer@example.com',
				attemptId: 'attempt-1',
			}),
		})
	);
	expect(await pendingCompletions(ctx.storeDB)).toEqual({});
});
it('a settled sale is the paid completion: receipt, refresh, checkout.completed row, attempt resolved', async () => {
	await recordCompletionAttempt(ctx.storeDB, {
		orderUuid: 'order',
		source: 'gateway',
		settledOrderStatus: 'pending',
	});
	const pending = { ...payload, status: 'pending', number: '1042', total: '92.95' };
	const resident = { uuid: 'order', getLatest: () => ({ payload: pending }) } as never;
	expect(
		await completeSale(
			{ ...ctx, actor: { id: '7', name: 'Pat' } },
			resident,
			{ source: 'gateway-settled', order: sent.order },
			{ host: 'stage', autoShowReceipt: true }
		)
	).toBe('completed');
	expect(mockReceipt).toHaveBeenCalledWith('order');
	expect(mockReconcile).toHaveBeenCalledWith(ctx.runtime, resident, true, ctx.stockAdjustment);
	expect(mockRefresh).not.toHaveBeenCalled();
	expect(mockActionLog).toHaveBeenCalledWith(
		'info',
		'Sale order completed',
		expect.objectContaining({
			actor: { id: '7', name: 'Pat' },
			context: expect.objectContaining({
				type: 'checkout.completed',
				orderId: 42,
				orderNumber: '1042',
				total: '92.95',
				paymentLegs: 0,
			}),
		})
	);
	expect(await pendingCompletions(ctx.storeDB)).toEqual({});
});
it('journals the stored status with a gateway attempt, and nothing when none is stored', async () => {
	await recordSaleAttempt(ctx, {
		order,
		completing: true,
		source: 'gateway',
		settledOrderStatus: 'pending',
	});
	expect((await pendingCompletions(ctx.storeDB)).order).toMatchObject({
		source: 'gateway',
		settledOrderStatus: 'pending',
	});
	await recordSaleAttempt(ctx, {
		order,
		completing: true,
		source: 'gateway',
		settledOrderStatus: null,
	});
	expect((await pendingCompletions(ctx.storeDB)).order).not.toHaveProperty('settledOrderStatus');
});
it("journals a pay-page attempt's whole catalog, keyed by gateway id", async () => {
	const catalog = { pos_cash: null, bacs: 'pending' };
	await recordSaleAttempt(ctx, {
		order,
		completing: true,
		source: 'gateway-snapshot',
		settledOrderStatuses: catalog,
	});
	const journaled = (await pendingCompletions(ctx.storeDB)).order;
	expect(journaled).toMatchObject({ source: 'gateway-snapshot', settledOrderStatuses: catalog });
	expect(journaled).not.toHaveProperty('settledOrderStatus');
});
it('replay never completes a sent order, whatever status its gateway chose', () => {
	const onHold = {
		...payload,
		status: 'on-hold',
		meta_data: withAwaitingCustomer([], sent.stamp),
	};
	expect(isSaleComplete({ source: 'replay' }, 2, onHold as never)).toBe(false);
	expect(isSaleComplete({ source: 'replay' }, 2, { ...payload, status: 'on-hold' } as never)).toBe(
		true
	);
});
it('a sent answer whose order is open shows no moment and writes no row', async () => {
	expect(
		await completeSale(
			ctx,
			order,
			{ ...sent, order: { ...sent.order, status: 'pos-open' } },
			{ host: 'stage', autoShowReceipt: true }
		)
	).toBe('not-completed');
	expect(mockReceipt).not.toHaveBeenCalled();
	expect(mockInfo).not.toHaveBeenCalled();
});
it('keeps completion helpers private to the owner and one another', () => {
	const violations: string[] = [];
	const scan = (directory: string) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) scan(path);
			else if (
				/\.tsx?$/.test(path) &&
				!/\.test\./.test(path) &&
				path !== join(__dirname, 'sale-completion.ts')
			) {
				if (
					/from ['"][^'"]*(?:provenance\/(?:stamp-completion|persist-provenance|provenance-gap)|hooks\/reconcile-completed-order)['"]/.test(
						readFileSync(path, 'utf8')
					)
				)
					violations.push(path);
			}
		}
	};
	scan(__dirname);
	expect(violations).toEqual([]);
});

it.each(['stamp', 'patch', 'push'] as const)(
	'online provenance rejects a failed %s before returning',
	async (failure) => {
		const error = new Error('write failed');
		if (failure === 'stamp') mockStamp.mockRejectedValueOnce(error);
		if (failure === 'patch') jest.mocked(mockPatch).mockResolvedValueOnce(undefined);
		if (failure === 'push') jest.mocked(ctx.pushDocument).mockRejectedValueOnce(error);
		await expect(persistSaleProvenance(ctx, { order, online: true })).rejects.toThrow(
			failure === 'patch' ? 'provenance_save_failed' : 'write failed'
		);
		if (failure !== 'push') expect(ctx.pushDocument).not.toHaveBeenCalled();
		if (failure === 'stamp') expect(mockPatch).not.toHaveBeenCalled();
	}
);
it('offline provenance without a split does not write or allocate metadata', async () => {
	await persistSaleProvenance(ctx, { order, online: false });
	expect(mockStamp).not.toHaveBeenCalled();
	expect(mockPatch).not.toHaveBeenCalled();
	expect(ctx.pushDocument).not.toHaveBeenCalled();
});

it('awaits the journal before returning the attempt to the money caller', async () => {
	const insert = jest.spyOn(ctx.storeDB, 'insertLocal');
	await recordSaleAttempt(ctx, { order, completing: true, source: 'manual' });
	expect((await pendingCompletions(ctx.storeDB)).order).toMatchObject({
		source: 'manual',
		attempts: 0,
	});
	expect(insert).toHaveBeenCalled();
});
it('refuses the attempt if the journal cannot be written', async () => {
	jest.spyOn(ctx.storeDB, 'insertLocal').mockRejectedValueOnce(new Error('disk full'));
	await expect(
		recordSaleAttempt(ctx, { order, completing: true, source: 'manual' })
	).rejects.toThrow('disk full');
});
it.each([
	[manual, 'completed'],
	[{ ...manual, remainingMinor: 50 }, 'partial'],
	[{ source: 'gateway-contract', status: 'failed' }, 'not-completed'],
] as const)('clears a decided %s only after the audit call', async (outcome, result) => {
	await recordCompletionAttempt(ctx.storeDB, { orderUuid: 'order', source: 'manual' });
	let atAudit: ReturnType<typeof pendingCompletions> | undefined;
	mockActionLog.mockImplementationOnce(() => {
		atAudit = pendingCompletions(ctx.storeDB);
	});
	expect(await completeSale(ctx, order, outcome, { host: 'background' })).toBe(result);
	if (result === 'completed') expect((await atAudit)?.order).toBeDefined();
	expect(await pendingCompletions(ctx.storeDB)).toEqual({});
});
it('retains a thrown completion with lastError and propagates the original error', async () => {
	await recordCompletionAttempt(ctx.storeDB, { orderUuid: 'order', source: 'manual' });
	const error = new Error('finish failed');
	mockReconcile.mockRejectedValueOnce(error);
	await expect(completeSale(ctx, order, manual, { host: 'background' })).rejects.toBe(error);
	expect((await pendingCompletions(ctx.storeDB)).order).toMatchObject({
		attempts: 1,
		lastError: 'finish failed',
	});
	expect(mockInfo).not.toHaveBeenCalled();
});
it.each([42, 0])(
	'replay refreshes only a remote order (%s), marks the audit and clears',
	async (id) => {
		const resident = { uuid: 'order', getLatest: () => ({ payload: { ...payload, id } }) } as never;
		await recordCompletionAttempt(ctx.storeDB, { orderUuid: 'order', source: 'terminal' });
		expect(await completeSale(ctx, resident, { source: 'replay' }, { host: 'background' })).toBe(
			'completed'
		);
		expect(mockReconcile).toHaveBeenCalledWith(ctx.runtime, resident, !!id, ctx.stockAdjustment);
		expect(mockActionLog).toHaveBeenCalledWith(
			'info',
			expect.any(String),
			expect.objectContaining({
				context: expect.objectContaining({ type: 'checkout.completed', replayed: true }),
			})
		);
		expect(mockReceipt).toHaveBeenCalledWith('order', { select: false });
		expect(await pendingCompletions(ctx.storeDB)).toEqual({});
	}
);
it.each([
	['completed', true],
	['on-hold', true],
	['cancelled', false],
	['pos-open', false],
	['pos-partial', false],
	['pending', false],
	['failed', false],
	['', false],
] as const)('replay accepts only paid statuses for %s', (status, expected) => {
	expect(isSaleComplete({ source: 'replay' }, 2, { ...payload, status } as never)).toBe(expected);
});

it('recreates a concurrently cleared attempt when finishing throws, with source and actor', async () => {
	const actor = { id: 'A', name: 'Cashier A' };
	const context = { ...ctx, actor };
	await recordSaleAttempt(context, { order, completing: true, source: 'manual' });
	const error = new Error('finish failed after another tab cleared');
	mockReconcile.mockImplementationOnce(async () => {
		await resolveCompletionAttempt(ctx.storeDB, 'order');
		throw error;
	});
	const before = Date.now();
	await expect(completeSale(context, order, manual, { host: 'background' })).rejects.toBe(error);
	const attempt = (await pendingCompletions(ctx.storeDB)).order;
	expect(attempt).toMatchObject({
		source: 'manual',
		actor,
		attempts: 1,
		lastError: error.message,
	});
	expect(Date.parse(attempt.at)).toBeGreaterThanOrEqual(before);
	expect(Date.parse(attempt.at)).toBeLessThanOrEqual(Date.now());
});

it.each([undefined, '', 'n/a', ' ', 'Infinity', '0x00'])(
	'manual unusable balance %p falls back only to a successful local prediction',
	(balance) => {
		for (const [remainingMinor, mirrorFailed, expected] of [
			[0, false, true],
			[50, false, false],
			[0, true, false],
		] as const) {
			expect(
				isSaleComplete(
					{
						...manual,
						remainingMinor,
						mirrorFailed,
						order: { status: 'completed', balance },
					} as unknown as SaleOutcome,
					2
				)
			).toBe(expected);
		}
	}
);
it.each([42, undefined])(
	'refreshes an unsettled manual summary only with server id %p',
	async (id) => {
		const resident = { uuid: 'order', getLatest: () => ({ payload: { ...payload, id } }) } as never;
		mockRefresh.mockResolvedValueOnce('refreshed');
		expect(
			await completeSale(
				ctx,
				resident,
				{ ...manual, order: { balance: '1.00' } } as unknown as SaleOutcome,
				{
					host: 'stage',
					autoShowReceipt: true,
				}
			)
		).toBe('partial');
		expect(mockRefresh).toHaveBeenCalledTimes(id ? 1 : 0);
		if (id) expect(mockRefresh).toHaveBeenCalledWith(ctx.runtime, id);
		expect(mockReconcile).not.toHaveBeenCalled();
		expect(mockReceipt).not.toHaveBeenCalled();
		expect(mockInfo).not.toHaveBeenCalled();
	}
);
it('does not refresh an unsettled manual sale when the store agrees with the till', async () => {
	const resident = {
		uuid: 'order',
		getLatest: () => ({ payload: { ...payload, id: 42 } }),
	} as never;
	expect(
		await completeSale(
			ctx,
			resident,
			{
				...manual,
				order: { balance: '1.00' },
				remainingMinor: 100,
			} as unknown as SaleOutcome,
			{ host: 'stage', autoShowReceipt: true }
		)
	).toBe('partial');
	expect(mockRefresh).not.toHaveBeenCalled();
	expect(mockReconcile).not.toHaveBeenCalled();
});
it.each(['timed-out', 'rejected'])(
	'retains an unsettled manual sale after refresh %s',
	async (failure) => {
		if (failure === 'rejected') mockRefresh.mockRejectedValueOnce(new Error('refresh failed'));
		else mockRefresh.mockResolvedValueOnce('timed-out');
		expect(
			await completeSale(
				ctx,
				order,
				{ ...manual, order: { balance: '1.00' } } as unknown as SaleOutcome,
				{
					host: 'background',
				}
			)
		).toBe('partial');
		expect(mockDebug).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ terminal: { outcome: 'recovered', operationId: '42' } })
		);
		expect(mockReceipt).not.toHaveBeenCalled();
		expect(mockInfo).not.toHaveBeenCalled();
	}
);
it.each([false, true])(
	'journals server settlement before finish without recording twice (prepared %s)',
	async (prepared) => {
		const context = { ...ctx, actor: { id: '7', name: 'Pat' } };
		const record = jest.spyOn(journal, 'recordCompletionAttempt');
		try {
			if (prepared) await recordSaleAttempt(context, { order, completing: true, source: 'manual' });
			let atReceipt: ReturnType<typeof pendingCompletions> | undefined;
			mockReceipt.mockImplementationOnce(() => {
				atReceipt = pendingCompletions(ctx.storeDB);
			});
			expect(
				await completeSale(
					context,
					order,
					{
						...manual,
						remainingMinor: prepared ? 0 : 50,
						order: { balance: '0.00' },
					} as unknown as SaleOutcome,
					{ host: 'background' }
				)
			).toBe('completed');
			expect((await atReceipt)?.order).toMatchObject({
				source: 'manual',
				actor: context.actor,
				attempts: 0,
			});
			expect(record).toHaveBeenCalledTimes(1);
			expect(record.mock.invocationCallOrder[0]).toBeLessThan(
				mockReceipt.mock.invocationCallOrder[0]
			);
			expect(await pendingCompletions(ctx.storeDB)).toEqual({});
		} finally {
			record.mockRestore();
		}
	}
);

// Use the real first-stamp helper: a mock that always restamps would hide this regression.
describe('gateway session attribution on retry', () => {
	beforeEach(() => {
		mockStamp.mockImplementation(
			jest.requireActual('./provenance/stamp-completion').completionMeta
		);
	});
	const original = [
		{ key: '_wcpos_sale_counter', value: '7' },
		{ key: '_wcpos_sale_time', value: '2026-09-18T08:00:00Z' },
		{ key: '_wcpos_register', value: 'register-A' },
		{ key: '_wcpos_session', value: 'session-A' },
	];
	const persist = async (meta: MetaDataEntry[], status: string, source?: SaleOutcome['source']) => {
		const current = {
			uuid: 'retry-order',
			getLatest: () => ({ payload: { status, meta_data: meta } }),
		};
		const input = { order: current as never, sessionId: 'session-B', online: true, source };
		await persistSaleProvenance(ctx, input);
		return (jest.mocked(mockPatch).mock.calls.at(-1)![0].data as { meta_data: MetaDataEntry[] })
			.meta_data;
	};
	it.each(['gateway-contract', 'gateway-snapshot'] as const)(
		'%s retry in B replaces only session A',
		async (source) => {
			const stamped = await completionMetaFor(ctx, [], { sessionId: 'session-A' });
			const meta = await persist(stamped, 'pos-open', source);
			expect(meta).toEqual([
				...stamped.filter(({ key }) => key !== '_wcpos_session'),
				{ key: '_wcpos_session', value: 'session-B' },
			]);
		}
	);
	it.each(['gateway-contract', 'gateway-snapshot'] as const)(
		'%s pre-change counter without session gains B',
		async (source) => {
			const preChange = original.filter(({ key }) => key !== '_wcpos_session');
			expect(await persist(preChange, 'failed', source)).toEqual([
				...preChange,
				{ key: '_wcpos_session', value: 'session-B' },
			]);
		}
	);
	it.each(['completed', 'processing', 'on-hold'])(
		'paid %s order retains session A',
		async (status) => {
			expect(await persist(original, status, 'gateway-contract')).toEqual(original);
		}
	);
	it('captured leg retains session A even before completing status', async () => {
		const meta = withLedger(original, [{ ...row, status: 'captured', session_id: 'session-A' }]);
		expect(await persist(meta, 'pos-partial', 'gateway-snapshot')).toEqual(meta);
	});
	it('tender provenance retains session A', async () => {
		expect(await persist(original, 'pos-open')).toEqual(original);
		expect(await completionMetaFor(ctx, original, { sessionId: 'session-B' })).toEqual(original);
	});
});

it.each([false, true])(
	'recordSaleAttempt journals only completing sales: %s',
	async (completing) => {
		const actor = { id: '7', name: 'Pat' };
		await recordSaleAttempt({ ...ctx, actor }, { order, completing, source: 'manual' });
		const attempts = await pendingCompletions(ctx.storeDB);
		if (completing)
			expect(attempts.order).toEqual(expect.objectContaining({ source: 'manual', actor }));
		else expect(attempts.order).toBeUndefined();
		expect(mockBound).not.toHaveBeenCalled();
		expect(mockSession).not.toHaveBeenCalled();
	}
);

it('uses the caller queue without enqueueing completion again', async () => {
	const enqueue = jest.spyOn(mutationQueue, 'enqueueOrderMutation');
	try {
		expect(
			await completeSale(
				ctx,
				order,
				manual,
				{ host: 'modal' },
				{ dispatchToken: createDispatchToken() }
			)
		).toBe('completed');
		expect(enqueue).not.toHaveBeenCalled();
		expect(mockActionLog).toHaveBeenCalledWith(
			'info',
			'Sale order completed',
			expect.objectContaining({
				context: expect.objectContaining({ type: 'checkout.completed', hookIds: [] }),
			})
		);
	} finally {
		enqueue.mockRestore();
	}
});
it('enqueues completion when no caller queue is supplied', async () => {
	const enqueue = jest.spyOn(mutationQueue, 'enqueueOrderMutation');
	try {
		await completeSale(ctx, order, manual, { host: 'modal' });
		expect(enqueue).toHaveBeenCalledWith('order', expect.any(Function));
	} finally {
		enqueue.mockRestore();
	}
});
it('a refused completion dispatch throws and records a failed attempt', async () => {
	const dispatch = jest
		.spyOn(actions, 'dispatchAction')
		.mockResolvedValueOnce({ deny: { reasonKey: 'unexpected_guard' } });
	try {
		await expect(completeSale(ctx, order, manual, { host: 'background' })).rejects.toThrow(
			'checkout.complete refused: unexpected_guard'
		);
		expect((await pendingCompletions(ctx.storeDB)).order).toMatchObject({
			attempts: 1,
			lastError: 'checkout.complete refused: unexpected_guard',
		});
	} finally {
		dispatch.mockRestore();
	}
});

it.each([
	['manual', { host: 'stage', autoShowReceipt: false }, 'user'],
	['manual', { host: 'modal' }, 'user'],
	['terminal', { host: 'background' }, 'system'],
	['replay', { host: 'background' }, 'replay'],
] as const)('dispatches %s from %j as %s', async (kind, presentation, source) => {
	const dispatch = jest.spyOn(actions, 'dispatchAction');
	const outcome: SaleOutcome =
		kind === 'manual'
			? manual
			: kind === 'terminal'
				? { source: kind, row, order: null, balance: '0' }
				: { source: kind };
	try {
		await completeSale({ ...ctx, actor: { id: '7', name: 'Pat' } }, order, outcome, presentation);
		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				event: CHECKOUT_COMPLETE_EVENT,
				input: {
					orderId: 'order',
					actor: ctx.actionActor,
					source,
					payload: {
						source: kind,
						presentation: presentation.host,
						actor: { id: '7', name: 'Pat' },
					},
				},
			})
		);
	} finally {
		dispatch.mockRestore();
	}
});
it('audits the summary read after reconciliation, including counted payment legs', async () => {
	let latest = { ...payload, number: 'before', total: '0.00' };
	const resident = { uuid: 'order', getLatest: () => ({ payload: latest }) } as never;
	mockReconcile.mockImplementationOnce(async () => {
		latest = {
			...payload,
			number: '1042',
			total: '50.00',
			meta_data: withLedger(
				[],
				[
					{ ...row, status: 'captured' },
					{ ...row, id: 'offline', status: 'authorized', recorded_offline: true },
					{ ...row, id: 'online', status: 'authorized', recorded_offline: false },
					{ ...row, id: 'failed', status: 'failed' },
				]
			) as never[],
		};
	});
	await completeSale({ ...ctx, actor: { id: '7', name: 'Pat' } }, resident, manual, {
		host: 'modal',
	});
	expect(mockActionLog.mock.calls).toEqual([
		[
			'info',
			'Sale order completed',
			{
				category: ['wcpos', 'pos', 'checkout'],
				actor: { id: '7', name: 'Pat' },
				context: {
					type: 'checkout.completed',
					orderId: 42,
					orderUUID: 'order',
					orderNumber: '1042',
					total: '50.00',
					paymentLegs: 2,
					hookIds: [],
				},
			},
		],
	]);
});

it.each([
	['a', 'a', true],
	['a', 'b', false],
	[undefined, 'b', true],
] as const)(
	'replay scalar gateway %s judges resident gateway %s as complete: %s',
	(settledOrderGateway, payment_method, expected) => {
		const outcome = {
			source: 'replay' as const,
			settledOrderStatus: 'pending',
			settledOrderGateway,
		};
		expect(isSaleComplete(outcome, 2, { ...payload, status: 'pending', payment_method })).toBe(
			expected
		);
	}
);
it('journals the gateway beside its scalar settled status', async () => {
	const attempt = {
		order,
		completing: true,
		source: 'gateway-contract' as const,
		settledOrderStatus: 'pending',
		settledOrderGateway: 'a',
	};
	await recordSaleAttempt(ctx, attempt);
	expect((await pendingCompletions(ctx.storeDB)).order).toMatchObject({
		settledOrderStatus: 'pending',
		settledOrderGateway: 'a',
	});
});
it.each(['pos-open', 'cancelled', 'pending'])(
	'replay revalidates refreshed %s before receipt, audit, and journal resolution',
	async (status) => {
		let latest = { ...payload, status: 'pending', payment_method: 'a' };
		const resident = { uuid: 'order', getLatest: () => ({ payload: latest }) } as never;
		const outcome = { source: 'replay' as const, settledOrderStatus: 'pending' };
		await recordCompletionAttempt(ctx.storeDB, { orderUuid: 'order', ...outcome });
		mockReconcile.mockImplementationOnce(async () => {
			expect(mockReceipt).not.toHaveBeenCalled();
			latest = { ...latest, status };
			return 'refreshed';
		});
		const result = await completeSale(ctx, resident, outcome, { host: 'background' });
		expect(mockReconcile).toHaveBeenCalledTimes(1);
		expect(mockReconcile).toHaveBeenCalledWith(ctx.runtime, resident, true, ctx.stockAdjustment);
		if (status === 'pending') {
			expect(result).toBe('completed');
			expect(mockReceipt).toHaveBeenCalledWith('order', { select: false });
			expect(mockActionLog).toHaveBeenCalledTimes(1);
			expect(await pendingCompletions(ctx.storeDB)).toEqual({});
		} else {
			expect(result).toBe('not-completed');
			expect(mockReceipt).not.toHaveBeenCalled();
			expect(mockActionLog).not.toHaveBeenCalled();
			expect((await pendingCompletions(ctx.storeDB)).order).toBeDefined();
		}
	}
);
it.each(['timed-out', 'failed', 'skipped', 'refreshed'])(
	'replay requires a confirmed refresh before completing (%s)',
	async (refreshResult) => {
		const outcome = { source: 'replay' as const };
		await recordCompletionAttempt(ctx.storeDB, { orderUuid: 'order', ...outcome });
		const resolve = jest.spyOn(journal, 'resolveCompletionAttempt');
		mockReconcile.mockResolvedValueOnce(refreshResult);
		const result = await completeSale(ctx, order, outcome, { host: 'background' });
		if (refreshResult === 'refreshed') {
			expect(result).toBe('completed');
			expect(mockReceipt).toHaveBeenCalled();
			expect(resolve).toHaveBeenCalled();
		} else {
			expect(result).toBe('not-completed');
			expect(mockReceipt).not.toHaveBeenCalled();
			expect(mockActionLog).not.toHaveBeenCalled();
			expect(resolve).not.toHaveBeenCalled();
			expect((await pendingCompletions(ctx.storeDB)).order).toBeDefined();
		}
		resolve.mockRestore();
	}
);
it.each([
	['released', [], []],
	['serve-local', [], []],
	['fetched', ['42'], []],
	['fetched', [], ['42']],
	['fetched', [], []],
] as const)(
	'replay completes only after a delivering requirement (%s, applied %j, pruned %j)',
	async (action, appliedRecordIds, prunedRecordIds) => {
		const { reconcileCompletedOrder } = jest.requireActual('./hooks/reconcile-completed-order');
		const release = jest.fn();
		const ready = Promise.resolve({ action, appliedRecordIds, prunedRecordIds });
		const runtime = {
			engine: { require: () => ({ ready, release }) },
		} as unknown as SaleContext['runtime'];
		mockReconcile.mockImplementationOnce(reconcileCompletedOrder);
		const outcome = { source: 'replay' as const };
		await recordCompletionAttempt(ctx.storeDB, { orderUuid: 'order', ...outcome });
		const result = await completeSale({ ...ctx, runtime }, order, outcome, { host: 'background' });
		await expect(mockReconcile.mock.results[0].value).resolves.toBe(
			appliedRecordIds.length ? 'refreshed' : 'failed'
		);
		if (appliedRecordIds.length > 0) {
			expect(result).toBe('completed');
			expect(mockReceipt).toHaveBeenCalled();
			expect(await pendingCompletions(ctx.storeDB)).toEqual({});
		} else {
			expect(result).toBe('not-completed');
			expect(mockReceipt).not.toHaveBeenCalled();
			expect(mockActionLog).not.toHaveBeenCalled();
			expect((await pendingCompletions(ctx.storeDB)).order).toBeDefined();
		}
		expect(release).toHaveBeenCalledTimes(1);
	}
);

// The authoritative resident, after the mirror, decides: a store answer that reads paid completes
// the sale only once the resident carries a paid status. Whether a newer adoption reopened it or
// the mirror never landed, the sale is refreshed, never sent to the receipt on the answer alone;
// the refresh then either completes it or leaves the reopened cart.
it.each([
	['a newer adoption reopened the sale', 'pos-open', 'partial'],
	['the mirror never landed', 'completed', 'completed'],
])('the resident is not paid after the mirror: %s', async (_, refreshedStatus, result) => {
	enterCheckout('order');
	expect(claimReceiptAutoPrint('order')).toBe(true);
	let status = 'pos-open';
	const resident = {
		uuid: 'order',
		getLatest: () => ({ payload: { ...payload, status } }),
	} as never;
	mockRefresh.mockImplementationOnce(async () => {
		status = refreshedStatus;
		return 'refreshed';
	});
	const answer = { ...manual, order: { status: 'completed', balance: '0.00' } } as SaleOutcome;
	expect(isSaleComplete(answer, 2, { ...payload, status: 'pos-open' } as never)).toBe(false);
	expect(await completeSale(ctx, resident, answer, { host: 'stage', autoShowReceipt: true })).toBe(
		result
	);
	expect(mockRefresh).toHaveBeenCalledWith(ctx.runtime, 42);
	if (result === 'partial') {
		expect(mockReceipt).not.toHaveBeenCalled();
		expect(claimReceiptAutoPrint('order')).toBe(true);
		expect(resolveStage('order', getCheckoutModeSnapshot(), [], status)).toBe('checkout');
	} else {
		expect(mockReceipt).toHaveBeenCalled();
		expect(claimReceiptAutoPrint('order')).toBe(false);
	}
});

// The gateway's settled answer follows the same rule as the cash and close paths: the resident
// after the mirror must read the settled status (paid, or the merchant's stored one) too.
it('a gateway settled after a reopen was adopted is not completed: no receipt', async () => {
	const resident = {
		uuid: 'order',
		getLatest: () => ({ payload: { ...payload, status: 'pos-open' } }),
	} as never;
	mockRefresh.mockResolvedValueOnce('refreshed'); // the refresh confirms the reopen
	const settled = { source: 'gateway-settled', order: { status: 'pending' } } as SaleOutcome;
	expect(isSaleComplete(settled, 2, { ...payload, status: 'pending' } as never)).toBe(true);
	expect(await completeSale(ctx, resident, settled, { host: 'stage', autoShowReceipt: true })).toBe(
		'not-completed'
	);
	expect(mockReceipt).not.toHaveBeenCalled();
});

// The store took the money (its answer reads paid) but the resident does not read paid yet and
// no refresh confirmed it: `unconfirmed`. No receipt, and the completion attempt stays for the
// bridge, which finishes it once the paid order is adopted.
it('an unconfirmed paid answer keeps its completion attempt and enters no receipt', async () => {
	await recordCompletionAttempt(ctx.storeDB, { orderUuid: 'order', source: 'manual' });
	const resident = {
		uuid: 'order',
		getLatest: () => ({ payload: { ...payload, status: 'pos-open' } }),
	} as never;
	mockRefresh.mockRejectedValueOnce(new Error('offline'));
	const answer = { ...manual, order: { status: 'completed', balance: '0.00' } } as SaleOutcome;
	expect(await completeSale(ctx, resident, answer, { host: 'stage', autoShowReceipt: true })).toBe(
		'unconfirmed'
	);
	expect(mockReceipt).not.toHaveBeenCalled();
	expect(await pendingCompletions(ctx.storeDB)).toHaveProperty('order');
});

// Moved from close-sale.test.ts when the close-side judge folded into `finishSale`: a close answer
// completes the sale only when the answer and the resident after the mirror both read paid, and
// only a refresh that lands tells a reopen from a lag (Codex 4341491589, 4341491563 on #2798).
describe('a zero balance the store answered closed', () => {
	let status: string;
	const resident = {
		uuid: 'order',
		getLatest: () => ({ payload: { ...payload, status } }),
	} as never;
	const closed = (answer = 'completed') =>
		({ source: 'zero-balance', order: { status: answer } }) as SaleOutcome;
	const stage = { host: 'stage', autoShowReceipt: true } as const;
	beforeEach(() => {
		status = 'pos-partial';
	});

	it('answered after another till’s reopen was adopted is not completed: no receipt', async () => {
		await recordCompletionAttempt(ctx.storeDB, { orderUuid: 'order', source: 'zero-balance' });
		status = 'pos-open';
		mockRefresh.mockResolvedValueOnce('refreshed');
		expect(await completeSale(ctx, resident, closed(), stage)).toBe('not-completed');
		expect(mockRefresh).toHaveBeenCalledWith(ctx.runtime, 42);
		expect(mockReceipt).not.toHaveBeenCalled();
		expect(await pendingCompletions(ctx.storeDB)).toEqual({});
	});

	// Codex on C1-S2: a disposed engine's refresh throws before it returns a promise; that proves
	// nothing either, so the close is unconfirmed, never a failed checkout.
	it.each(['failed', 'timed-out', 'throws', 'throws synchronously'])(
		'a paid answer the resident does not show is unconfirmed when the refresh %s',
		async (how) => {
			await recordCompletionAttempt(ctx.storeDB, { orderUuid: 'order', source: 'zero-balance' });
			enterCheckout('order');
			expect(claimReceiptAutoPrint('order')).toBe(true);
			mockRefresh.mockImplementationOnce(
				how === 'throws synchronously'
					? () => {
							throw new Error('engine disposed');
						}
					: async () => {
							if (how === 'throws') throw new Error('engine unavailable');
							return how;
						}
			);
			expect(await completeSale(ctx, resident, closed(), stage)).toBe('unconfirmed');
			expect(mockReceipt).not.toHaveBeenCalled();
			expect(claimReceiptAutoPrint('order')).toBe(true);
			expect(await pendingCompletions(ctx.storeDB)).toMatchObject({
				order: { awaitingAdoption: true },
			});
		}
	);

	it('completes when the refresh lands the paid order', async () => {
		mockRefresh.mockImplementationOnce(async () => {
			status = 'completed';
			return 'refreshed';
		});
		expect(await completeSale(ctx, resident, closed(), stage)).toBe('completed');
	});

	it('is not completed when the refresh lands and the resident still reads unpaid', async () => {
		await recordCompletionAttempt(ctx.storeDB, { orderUuid: 'order', source: 'zero-balance' });
		mockRefresh.mockResolvedValueOnce('refreshed');
		expect(await completeSale(ctx, resident, closed(), stage)).toBe('not-completed');
		expect(await pendingCompletions(ctx.storeDB)).toEqual({});
	});

	it('a paid close the resident already shows costs no refresh', async () => {
		status = 'completed';
		expect(await completeSale(ctx, resident, closed(), stage)).toBe('completed');
		expect(mockRefresh).not.toHaveBeenCalled();
	});

	// An open answer needs no refresh; a paid one the refresh confirms unpaid ends the same way.
	it.each(['pos-open', 'completed'])(
		'a reopened close (answer %s) returns to checkout and releases its print claim',
		async (answer) => {
			status = 'pos-open';
			enterCheckout('order');
			expect(claimReceiptAutoPrint('order')).toBe(true);
			mockRefresh.mockResolvedValueOnce('refreshed');
			expect(await completeSale(ctx, resident, closed(answer), stage)).toBe('not-completed');
			expect(mockRefresh).toHaveBeenCalledTimes(answer === 'completed' ? 1 : 0);
			expect(claimReceiptAutoPrint('order')).toBe(true);
			expect(resolveStage('order', getCheckoutModeSnapshot(), [], status)).toBe('checkout');
			expect(getCheckoutModeSnapshot().receiptOrders.has('order')).toBe(false);
			expect(getCheckoutModeSnapshot().checkoutOrders.has('order')).toBe(true);
			expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
		}
	);
});

describe('isSettledOrderStatus', () => {
	it.each(['processing', 'completed', 'on-hold', 'invoiced'])(
		'treats %s as settled with no stored status (the blocklist it always was)',
		(status) => {
			expect(isSettledOrderStatus(status, null)).toBe(true);
			expect(isSettledOrderStatus(status, undefined)).toBe(true);
		}
	);

	it.each(['pending', 'failed', 'cancelled'])(
		'treats %s as unpaid with no stored status',
		(status) => {
			expect(isSettledOrderStatus(status, null)).toBe(false);
			expect(isSettledOrderStatus(status, undefined)).toBe(false);
		}
	);

	it('treats an unpaid status as settled only when it is the stored status', () => {
		expect(isSettledOrderStatus('pending', 'pending')).toBe(true);
		expect(isSettledOrderStatus('pending', 'completed')).toBe(false);
		expect(isSettledOrderStatus('failed', 'pending')).toBe(false);
	});

	// refunded and trash: sync-core's isPaidStatus, the close answer's rule, reads them unpaid.
	it.each(['pos-open', 'pos-partial', 'failed', 'cancelled', 'refunded', 'trash'])(
		'never settles %s, even when it is the stored status',
		(status) => {
			// The settings picker offers every registered status; a stored `failed`
			// must not turn a failed payment into a finished sale.
			expect(isSettledOrderStatus(status, status)).toBe(false);
			expect(isSettledOrderStatus(status, null)).toBe(false);
		}
	);
});
