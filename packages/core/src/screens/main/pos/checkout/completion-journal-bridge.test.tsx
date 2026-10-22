/** @jest-environment jsdom */
import * as React from 'react';

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { NEVER, Subject } from 'rxjs';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { DRAINABLE_SCOPE_DATABASE_GENERATION, scopeDatabaseName } from '@wcpos/sync-core';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import * as unsentChanges from '@wcpos/utils/unsent-changes';
import {
	forgetUnsentChanges,
	markLegacyDrainPending,
	rememberLegacyUnsentChanges,
} from '@wcpos/utils/unsent-changes';
import { RECOVERY_RETRY_DELAYS_MS } from '@wcpos/query';
import * as journal from '@wcpos/query/store-local';
import { pendingCompletions, recordCompletionAttempt } from '@wcpos/query/store-local';

import { createActionContext } from '../../../../extensions/actions';
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
const mockRecover = jest.fn();
const mockResidentOrders = jest.fn();
let mockHttp = { post: jest.fn() };
let mockOnline = 'online-website-available';
jest.mock('@wcpos/query', () => ({
	RECOVERY_RETRY_DELAYS_MS: jest.requireActual('@wcpos/query').RECOVERY_RETRY_DELAYS_MS,
	useQueryRuntime: () => mockManager,
	recoverMoneyCommands: (...args: unknown[]) => mockRecover(...args),
	observeResidentOrders: (...args: unknown[]) => mockResidentOrders(...args),
}));
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => mockHttp }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnline }),
}));
jest.mock('./hooks/use-sale-context', () => ({ useSaleContext: () => mockContext }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: mockContext.storeDB }),
}));
jest.mock('@wcpos/query/record-readers', () => ({
	readResidentOrder: (...args: unknown[]) => mockFind(...args),
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
	mockRecover.mockResolvedValue([]);
	mockHttp = { post: jest.fn() };
	mockResidentOrders.mockReturnValue(NEVER);
	mockOnline = 'online-website-available';
	mockRefresh.mockResolvedValue('refreshed');
	mockStartVersion = 0;
	mockManager = {};
	mockContext = {
		actionActor: { userId: 7, registerId: 'register', sessionId: null },
		actionCtx: createActionContext({
			log: (_level, message, options) => {
				const { category: _category, ...rest } = options ?? {};
				mockInfo(message, rest);
			},
			t: (key) => key,
			readCatalog: async () => null,
			readPaymentMethod: () => null,
			preventOverselling: false,
			priceDecimals: 2,
			resolveSession: async () => ({ registerId: null, sessionId: null }),
		}),

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

// ADR 0040 §1.3: a pull can adopt a sale its unanswered command completed and take it out of the
// open orders, so no tender is left to press Try again; the store session re-sends it.
it('re-sends unanswered money commands at start, before replaying, and finishes the sale an answer completed', async () => {
	await record();
	mockFind.mockResolvedValue(resident('order', 'pos-open'));
	mockRecover.mockImplementation(async () => {
		mockFind.mockResolvedValue(resident());
		return [{ orderUuid: 'order', answers: [{ kind: 'close', data: {} }] }];
	});
	render(<SaleCompletionBridge />);
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(mockRecover).toHaveBeenCalledWith(mockManager, mockContext.storeDB, {
		post: expect.any(Function),
	});
	expect(mockRecover.mock.invocationCallOrder[0]).toBeLessThan(
		mockFind.mock.invocationCallOrder[0]
	);
	expect(owner.completeSale).toHaveBeenCalledTimes(1);
	expect(mockCatchUp).not.toHaveBeenCalled();
});

it('a reconnect re-sends what the outage left unanswered and finishes only the orders it answered', async () => {
	mockOnline = 'offline';
	await record('order');
	await record('other');
	const completed = new Set<string>();
	mockFind.mockImplementation(async (_manager: unknown, uuid: string) =>
		resident(uuid, completed.has(uuid) ? 'completed' : 'pos-open')
	);
	const view = render(<SaleCompletionBridge />);
	await waitFor(async () =>
		expect((await pendingCompletions(mockContext.storeDB)).other).toMatchObject({
			unpaidStarts: 1,
		})
	);
	expect(mockRecover).not.toHaveBeenCalled();
	mockRecover.mockImplementation(async () => {
		completed.add('order');
		completed.add('other');
		return [{ orderUuid: 'order', answers: [{ kind: 'record', data: {} }] }];
	});
	mockOnline = 'online-website-available';
	view.rerender(<SaleCompletionBridge />);
	await waitFor(() => expect(owner.completeSale).toHaveBeenCalledTimes(1));
	expect(owner.completeSale).toHaveBeenCalledWith(
		mockContext,
		expect.objectContaining({ uuid: 'order' }),
		{ source: 'replay' },
		{ host: 'background' }
	);
	expect(mockRecover).toHaveBeenCalledTimes(1);
	// Only the answered order is replayed: the other's unpaid start is not counted twice.
	expect((await pendingCompletions(mockContext.storeDB)).other).toMatchObject({ unpaidStarts: 1 });
});

// A claim persisted by a process that crashed after its send holds the command for the lease:
// the recovery skips it, and is run again when that lease lapses, while the till stays online.
async function claimLapsingIn(ms: number) {
	mockManager = { engine: { active: () => ({ scopeId: 'scope-1' }) } };
	const real = Date.now();
	const now = jest.spyOn(Date, 'now').mockReturnValue(real - journal.CLAIM_LEASE_MS + ms);
	await journal.claimRoute(
		mockContext.storeDB,
		{ orderUuid: 'order', kind: 'close', target: null, rowId: null },
		'crashed-tab',
		{
			orderUuid: 'order',
			scope: 'scope-1',
			kind: 'close',
			path: 'orders/42/close',
			target: null,
			id: 'close-1',
			body: {},
			approval: { total: '0.00', currency: 'USD' },
			sentAt: null,
			sentRevision: null,
		}
	);
	await journal.markSent(mockContext.storeDB, 'order', 'close-1', 'sha256:r1', 'crashed-tab');
	now.mockRestore();
}

it('re-runs the recovery when a skipped claim lapses, without a reconnect', async () => {
	await claimLapsingIn(400);
	render(<SaleCompletionBridge />);
	await waitFor(() => expect(mockRecover).toHaveBeenCalledTimes(1));
	await waitFor(() => expect(mockRecover).toHaveBeenCalledTimes(2), { timeout: 3000 });
});

// The effect re-runs on the same session (a context change, StrictMode): its cleanup clears the
// lapse timer, and the reused session must arm it again rather than lose the re-run.
it('keeps the lapse re-run across an effect re-run of the same session', async () => {
	await claimLapsingIn(600);
	const view = render(<SaleCompletionBridge />);
	await waitFor(() => expect(mockRecover).toHaveBeenCalledTimes(1));
	await drain();
	mockContext = { ...mockContext };
	view.rerender(<SaleCompletionBridge />);
	await waitFor(() => expect(mockRecover).toHaveBeenCalledTimes(2), { timeout: 3000 });
});

// Codex 4344063828 on #2836: a store or site switch while recovery awaits its preflight must not
// send the old journal's command through the new session's client. The send is refused, so the
// poster keeps the command journaled for its own session.
it('refuses a recovery POST once its session has been switched away', async () => {
	let preflight!: () => void;
	let sent: Promise<unknown> | undefined;
	mockRecover.mockImplementationOnce(
		async (
			_runtime: unknown,
			_db: unknown,
			deps: { post: (url: string, body: unknown) => Promise<unknown> }
		) => {
			await new Promise<void>((resolve) => {
				preflight = resolve;
			});
			sent = deps.post('orders/42/close', {});
			await sent.catch(() => undefined);
			return [];
		}
	);
	const view = render(<SaleCompletionBridge />);
	await waitFor(() => expect(mockRecover).toHaveBeenCalledTimes(1));
	const before = { http: mockHttp, storeDB: mockContext.storeDB };
	mockHttp = { post: jest.fn() };
	mockContext = {
		...mockContext,
		storeDB: await createRxDatabase({
			name: `switched${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			localDocuments: true,
			multiInstance: false,
		}),
	};
	view.rerender(<SaleCompletionBridge />);
	await act(async () => preflight());
	await waitFor(() => expect(sent).toBeDefined());
	await expect(sent).rejects.toThrow('money_command_session_stopped');
	expect(before.http.post).not.toHaveBeenCalled();
	expect(mockHttp.post).not.toHaveBeenCalled();
	await before.storeDB.remove();
});

/** Record the ladder's delays; `fire` runs its steps at once, else no long timer runs. */
function ladderTimers(fire: boolean) {
	const realSetTimeout = global.setTimeout;
	const delays: number[] = [];
	const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((
		callback: () => void,
		ms?: number
	) => {
		// Fired, only the ladder's own steps (a claim's lapse keeps its real delay); held, any long
		// timer, so a re-armed step's remaining delay is seen too.
		if (fire ? RECOVERY_RETRY_DELAYS_MS.includes(ms ?? 0) : (ms ?? 0) >= 20_000) {
			delays.push(ms!);
			return realSetTimeout(fire ? callback : () => undefined, 0);
		}
		return realSetTimeout(callback, ms);
	}) as never);
	return { delays, restore: () => spy.mockRestore() };
}

// Codex 4344063834 on #2836: a real transient failure releases the poster's claim (the journal
// watch arms a step) and then reports unanswered (the run arms again). Scheduling twice must
// not advance the ladder; only an executed retry does.
it('advances the ladder only when a retry runs, whoever schedules it', async () => {
	mockManager = { engine: { active: () => ({ scopeId: 'scope-1' }) } };
	const route = { orderUuid: 'order', kind: 'close' as const, target: null, rowId: null };
	// A failed re-send as the poster leaves it: claimed, sent, the claim given up. The claim is
	// stamped ahead, so it is never live and schedules no lapse.
	const failedResend = async (claimant: string) => {
		const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5_000);
		await journal.claimRoute(mockContext.storeDB, route, claimant, {
			orderUuid: 'order',
			scope: 'scope-1',
			kind: 'close',
			path: 'orders/42/close',
			target: null,
			id: 'close-1',
			body: {},
			approval: { total: '0.00', currency: 'USD' },
			sentAt: null,
			sentRevision: null,
		});
		await journal.markSent(mockContext.storeDB, 'order', 'close-1', 'sha256:r1', claimant);
		await journal.releaseClaim(mockContext.storeDB, 'order', 'close-1', claimant);
		now.mockRestore();
		return [{ orderUuid: 'order', answers: [], unanswered: true }];
	};
	const timers = ladderTimers(true);
	try {
		mockRecover
			.mockImplementationOnce(() => failedResend('start'))
			.mockImplementationOnce(() => failedResend('retry-1'))
			.mockResolvedValue([]);
		render(<SaleCompletionBridge />);
		await waitFor(() => expect(mockRecover).toHaveBeenCalledTimes(3));
		await drain();
		expect(timers.delays).toEqual([30_000, 120_000]);
	} finally {
		timers.restore();
	}
});

it('keeps the armed step and its deadline across an effect re-run', async () => {
	mockRecover.mockResolvedValueOnce([{ orderUuid: 'order', answers: [], unanswered: true }]);
	const timers = ladderTimers(false);
	try {
		const view = render(<SaleCompletionBridge />);
		await waitFor(() => expect(timers.delays).toEqual([30_000]));
		mockContext = { ...mockContext };
		view.rerender(<SaleCompletionBridge />);
		await drain();
		expect(timers.delays).toHaveLength(2);
		expect(timers.delays[1]).toBeLessThanOrEqual(30_000);
		expect(timers.delays[1]).toBeGreaterThan(25_000);
		expect(mockRecover).toHaveBeenCalledTimes(1);
	} finally {
		timers.restore();
	}
});

// A re-send that fails transiently (429, 5xx, no answer) leaves the command journaled and
// unclaimed: while the till stays online nothing else would re-run the recovery, so it backs off.
it('backs off and re-runs a recovery whose re-send failed, until one answers', async () => {
	const realSetTimeout = global.setTimeout;
	const delays: number[] = [];
	const timers = jest.spyOn(global, 'setTimeout').mockImplementation(((
		callback: () => void,
		ms?: number
	) => {
		if ((ms ?? 0) >= 30_000) {
			delays.push(ms!);
			return realSetTimeout(callback, 0);
		}
		return realSetTimeout(callback, ms);
	}) as never);
	try {
		mockRecover
			.mockResolvedValueOnce([{ orderUuid: 'order', answers: [], unanswered: true }])
			.mockResolvedValueOnce([{ orderUuid: 'order', answers: [], unanswered: true }])
			.mockResolvedValue([]);
		render(<SaleCompletionBridge />);
		await waitFor(() => expect(mockRecover).toHaveBeenCalledTimes(3));
		await drain();
		expect(delays).toEqual([30_000, 120_000]);
	} finally {
		timers.mockRestore();
	}
});

// A command whose answers are all lost after the session's first recovery, while the till stays
// online: the bridge sees it in the journal and schedules the recovery, so a sale whose tender a
// pull has closed still gets its receipt and audit. Another scope's command waits for that scope:
// the recovery re-sends only the active scope's (Codex 4333124076 on #2798).
it.each([
	['schedules the recovery for', 'scope-1', [RECOVERY_RETRY_DELAYS_MS[0]]],
	['leaves to its scope', 'other-scope', []],
])(
	'%s a command journaled and left unanswered after the session started (%s)',
	async (_, scope, armed) => {
		mockManager = { engine: { active: () => ({ scopeId: 'scope-1' }) } };
		const realSetTimeout = global.setTimeout;
		const delays: number[] = [];
		const timers = jest.spyOn(global, 'setTimeout').mockImplementation(((
			callback: () => void,
			ms?: number
		) => {
			// Only the ladder's steps run at once; a claim's lapse (below, not a step) keeps its delay.
			if (RECOVERY_RETRY_DELAYS_MS.includes(ms ?? 0)) {
				delays.push(ms!);
				return realSetTimeout(callback, 0);
			}
			return realSetTimeout(callback, ms);
		}) as never);
		// The tender's claim is taken five seconds ahead, so its lapse is never a ladder step.
		let now: jest.SpyInstance | undefined;
		try {
			render(<SaleCompletionBridge />);
			await waitFor(() => expect(mockRecover).toHaveBeenCalledTimes(1));
			await drain();
			expect(delays).toEqual([]);
			// The tender's send lost its answer: sent, its claim given up.
			now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5_000);
			await journal.claimRoute(
				mockContext.storeDB,
				{ orderUuid: 'order', kind: 'close', target: null, rowId: null },
				'tender',
				{
					orderUuid: 'order',
					scope,
					kind: 'close',
					path: 'orders/42/close',
					target: null,
					id: 'close-1',
					body: {},
					approval: { total: '0.00', currency: 'USD' },
					sentAt: null,
					sentRevision: null,
				}
			);
			await journal.markSent(mockContext.storeDB, 'order', 'close-1', 'sha256:r1', 'tender');
			await journal.releaseClaim(mockContext.storeDB, 'order', 'close-1', 'tender');
			now.mockRestore();
			await drain();
			await drain();
			await waitFor(() => expect(mockRecover).toHaveBeenCalledTimes(1 + armed.length));
			expect(delays).toEqual(armed);
		} finally {
			now?.mockRestore();
			timers.mockRestore();
		}
	}
);

// A full-balance gateway submit answered `sent` whose answer was lost: the recovery's answer is
// the sent outcome, finished as a sent sale (the `checkout.sent` audit, the attempt resolved),
// never the unpaid replay that would count starts and abandon it.
it('finishes a recovered sent submit through the sent-sale path', async () => {
	await record();
	const stamp = {
		method_id: 'wcpos_email_invoice',
		destination: 'a@b.c',
		attempt_id: 'attempt-1',
		sent_at_gmt: '2026-10-20T10:00:00Z',
		cashier_id: 7,
	};
	mockFind.mockResolvedValue({
		uuid: 'order',
		getLatest: () => ({
			payload: {
				id: 42,
				status: 'pending',
				meta_data: [{ key: '_wcpos_awaiting_customer', value: stamp }],
				line_items: [],
			},
		}),
	});
	const summary = { status: 'pending' };
	mockRecover.mockResolvedValueOnce([
		{
			orderUuid: 'order',
			answers: [{ kind: 'submit', data: { outcome: 'sent', order: summary } }],
		},
	]);
	render(<SaleCompletionBridge />);
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(owner.completeSale).toHaveBeenCalledWith(
		expect.anything(),
		expect.objectContaining({ uuid: 'order' }),
		{ source: 'gateway', order: summary, stamp },
		{ host: 'background' }
	);
	expect(mockInfo).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({ context: expect.objectContaining({ type: 'checkout.sent' }) })
	);
});

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

describe('a previous-generation database the drain keeps', () => {
	const IDENTITY = { site: 'https://store.example.test', storeId: 1, cashierId: 2 };
	const LEGACY = scopeDatabaseName(IDENTITY, { generation: DRAINABLE_SCOPE_DATABASE_GENERATION });
	/** A fresh runtime (a new session start) whose engine is active on IDENTITY. */
	const onScope = () => ({
		engine: {
			active: () => ({ identity: IDENTITY }),
			whenActive: async () => ({ identity: IDENTITY }),
		},
	});
	beforeEach(() => {
		mockManager = onScope();
	});
	afterEach(() => forgetUnsentChanges());

	it('waits for the drain to report before deciding, then counts the start when nothing is kept', async () => {
		await record();
		mockFind.mockResolvedValue(null);
		markLegacyDrainPending(LEGACY);
		render(<SaleCompletionBridge />);
		await waitFor(() => expect(mockFind).toHaveBeenCalledTimes(1));
		await drain();
		// Still waiting: nothing recorded against the order yet.
		expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({ attempts: 0 });

		rememberLegacyUnsentChanges(LEGACY, 0);
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
				attempts: 1,
				missingStarts: 1,
				lastError: 'order_not_resident',
			})
		);
		// Looked again after the report: a carried-over cart would be found here.
		expect(mockFind).toHaveBeenCalledTimes(2);
		expect(mockWarn).not.toHaveBeenCalled();
	});

	describe('when the active scope cannot be resolved', () => {
		/** The 30 s bound elapses at once; every other timer runs as scheduled. */
		const boundElapsesAtOnce = () => {
			const realSetTimeout = globalThis.setTimeout;
			return jest
				.spyOn(globalThis, 'setTimeout')
				.mockImplementation(((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) =>
					realSetTimeout(fn, ms === 30_000 ? 0 : ms, ...args)) as typeof setTimeout);
		};

		it('a lookup that outlasts the bound is unknown: replayed, warned once, not counted', async () => {
			await record();
			mockFind.mockResolvedValue(null);
			boundElapsesAtOnce();
			mockManager = { engine: { active: () => null, whenActive: () => new Promise(() => {}) } };
			render(<SaleCompletionBridge />);
			await waitFor(async () =>
				expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
					attempts: 1,
					lastError: 'order_not_resident',
				})
			);
			expect((await pendingCompletions(mockContext.storeDB)).order?.missingStarts).toBeUndefined();
			expect(mockWarn).toHaveBeenCalledTimes(1);
		});

		it('a lookup that rejects is unknown: not counted', async () => {
			await record();
			mockFind.mockResolvedValue(null);
			mockManager = {
				engine: {
					active: () => null,
					whenActive: () => Promise.reject(new Error('no store scope')),
				},
			};
			render(<SaleCompletionBridge />);
			await waitFor(async () =>
				expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
					attempts: 1,
				})
			);
			expect((await pendingCompletions(mockContext.storeDB)).order?.missingStarts).toBeUndefined();
		});

		it('a lookup that resolves to a scope with no v5 is countable', async () => {
			await record();
			mockFind.mockResolvedValue(null);
			let activate!: () => void;
			const opening = new Promise<{ identity: typeof IDENTITY }>((resolve) => {
				activate = () => resolve({ identity: IDENTITY });
			});
			mockManager = { engine: { active: () => null, whenActive: () => opening } };
			render(<SaleCompletionBridge />);
			await waitFor(() => expect(mockFind).toHaveBeenCalledTimes(1));
			activate();
			await waitFor(async () =>
				expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
					attempts: 1,
					missingStarts: 1,
				})
			);
			expect(mockWarn).not.toHaveBeenCalled();
		});
	});

	it('a replay that starts before the engine is active (cold boot) waits for the scope, then for its report', async () => {
		await record();
		mockFind.mockResolvedValue(null);
		markLegacyDrainPending(LEGACY);
		let activate!: () => void;
		const opening = new Promise<{ identity: typeof IDENTITY }>((resolve) => {
			activate = () => resolve({ identity: IDENTITY });
		});
		mockManager = { engine: { active: () => null, whenActive: () => opening } };
		render(<SaleCompletionBridge />);
		await waitFor(() => expect(mockFind).toHaveBeenCalledTimes(1));
		await drain();
		expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({ attempts: 0 });

		// The engine opens; then the drain reports it kept THIS order: the start is not counted.
		activate();
		await drain();
		expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({ attempts: 0 });
		rememberLegacyUnsentChanges(LEGACY, 1, ['order']);
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
				attempts: 1,
				lastError: 'order_not_resident',
			})
		);
		expect((await pendingCompletions(mockContext.storeDB)).order?.missingStarts).toBeUndefined();
		expect(mockWarn).not.toHaveBeenCalled();
	});

	it('never counts or abandons an order the kept database still holds work for', async () => {
		await record();
		mockFind.mockResolvedValue(null);
		rememberLegacyUnsentChanges(LEGACY, 2, ['order', 'another-order']);
		const view = render(<SaleCompletionBridge />);
		for (const attempts of [1, 2, 3, 4]) {
			await waitFor(async () =>
				expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
					attempts,
					lastError: 'order_not_resident',
				})
			);
			expect((await pendingCompletions(mockContext.storeDB)).order?.missingStarts).toBeUndefined();
			mockManager = onScope();
			view.rerender(<SaleCompletionBridge />);
		}
		expect(mockWarn).not.toHaveBeenCalled();
	});

	it('still counts the start when the kept work belongs to another order', async () => {
		await record();
		mockFind.mockResolvedValue(null);
		rememberLegacyUnsentChanges(LEGACY, 1, ['another-order']);
		render(<SaleCompletionBridge />);
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
				attempts: 1,
				missingStarts: 1,
			})
		);
	});

	it('replays once the bounded wait elapses, warns once, and does NOT count the start (unknown)', async () => {
		await record();
		await record('second-order');
		mockFind.mockResolvedValue(null);
		markLegacyDrainPending(LEGACY);
		const wait = jest
			.spyOn(unsentChanges, 'awaitLegacyUnsentReport')
			.mockResolvedValue('timed-out');
		render(<SaleCompletionBridge />);
		await waitFor(async () => {
			const pending = await pendingCompletions(mockContext.storeDB);
			expect(pending.order).toMatchObject({ attempts: 1, lastError: 'order_not_resident' });
			expect(pending['second-order']).toMatchObject({ attempts: 1 });
		});
		const pending = await pendingCompletions(mockContext.storeDB);
		expect(pending.order?.missingStarts).toBeUndefined();
		expect(pending['second-order']?.missingStarts).toBeUndefined();
		expect(wait).toHaveBeenCalledTimes(1);
		expect(wait).toHaveBeenCalledWith(LEGACY, 30_000);
		expect(mockWarn).toHaveBeenCalledTimes(1);
		expect(mockWarn).toHaveBeenCalledWith(
			'Replaying sale completions without the previous database version report',
			expect.anything()
		);
	});

	it('three starts whose report times out never abandon; a later start with a real report counts', async () => {
		await record();
		mockFind.mockResolvedValue(null);
		markLegacyDrainPending(LEGACY);
		const wait = jest
			.spyOn(unsentChanges, 'awaitLegacyUnsentReport')
			.mockResolvedValue('timed-out');
		const view = render(<SaleCompletionBridge />);
		for (const attempts of [1, 2, 3]) {
			await waitFor(async () =>
				expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({ attempts })
			);
			expect((await pendingCompletions(mockContext.storeDB)).order?.missingStarts).toBeUndefined();
			mockManager = onScope();
			view.rerender(<SaleCompletionBridge />);
		}
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({ attempts: 4 })
		);
		expect((await pendingCompletions(mockContext.storeDB)).order?.missingStarts).toBeUndefined();
		expect(mockWarn).not.toHaveBeenCalledWith(
			'Pending sale completion abandoned: order not resident',
			expect.anything()
		);

		// The drain reports: nothing kept. That start counts.
		wait.mockRestore();
		rememberLegacyUnsentChanges(LEGACY, 0);
		mockManager = onScope();
		view.rerender(<SaleCompletionBridge />);
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
				attempts: 5,
				missingStarts: 1,
			})
		);
	});

	it("another scope's kept uuid does not spare this scope's order", async () => {
		await record();
		mockFind.mockResolvedValue(null);
		// Scope A (visited earlier) keeps the uuid; the ACTIVE scope's v5 keeps nothing.
		rememberLegacyUnsentChanges('pos_v5_ffffffffffff_s9_c9', 1, ['order']);
		rememberLegacyUnsentChanges(LEGACY, 0);
		render(<SaleCompletionBridge />);
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
				attempts: 1,
				missingStarts: 1,
			})
		);
	});

	it("does not wait on another scope's mark", async () => {
		await record();
		mockFind.mockResolvedValue(null);
		markLegacyDrainPending('pos_v5_ffffffffffff_s9_c9');
		render(<SaleCompletionBridge />);
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
				attempts: 1,
				missingStarts: 1,
			})
		);
		expect(mockWarn).not.toHaveBeenCalled();
	});

	it('an uncountable report (the drain failed to open it) does not count the start; a later countable one does', async () => {
		await record();
		mockFind.mockResolvedValue(null);
		rememberLegacyUnsentChanges(LEGACY, null);
		const view = render(<SaleCompletionBridge />);
		for (const attempts of [1, 2, 3]) {
			await waitFor(async () =>
				expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
					attempts,
					lastError: 'order_not_resident',
				})
			);
			expect((await pendingCompletions(mockContext.storeDB)).order?.missingStarts).toBeUndefined();
			mockManager = onScope();
			view.rerender(<SaleCompletionBridge />);
		}
		// A later start whose drain reports nothing kept: that start counts.
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({ attempts: 4 })
		);
		rememberLegacyUnsentChanges(LEGACY, 0);
		mockManager = onScope();
		view.rerender(<SaleCompletionBridge />);
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
				attempts: 5,
				missingStarts: 1,
			})
		);
		expect(mockWarn).not.toHaveBeenCalled();
	});
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
	// Twice per start: once, then again after the (immediate) previous-version drain report.
	expect(mockFind).toHaveBeenCalledTimes(6);
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
	mockFind.mockImplementation(async (_manager, uuid) => resident(uuid));
	let release!: () => void;
	mockRefresh.mockImplementationOnce(
		() =>
			new Promise<string>((resolve) => {
				release = () => resolve('refreshed');
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
	mockFind.mockImplementation(async (_manager, uuid) => resident(uuid));
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

it.each(['timed-out', 'failed', 'rejected', 'synchronously thrown'] as const)(
	'retains an open resident when catch-up is %s',
	async (failure) => {
		await record();
		mockFind.mockResolvedValue(resident('order', 'pos-open'));
		// 'failed' is a fetched pull that did not deliver this order (pruned, or the
		// local-work guard refused the row): the cached copy is still suspect and must
		// not count as an unpaid start.
		if (failure === 'timed-out' || failure === 'failed') mockCatchUp.mockResolvedValueOnce(failure);
		else if (failure === 'synchronously thrown')
			mockCatchUp.mockImplementationOnce(() => {
				throw new Error('refresh rejected');
			});
		else mockCatchUp.mockRejectedValueOnce(new Error('refresh rejected'));
		render(<SaleCompletionBridge />);
		await waitFor(async () =>
			expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
				attempts: 1,
				lastError:
					failure === 'timed-out' || failure === 'failed'
						? `completion_refresh_${failure}`
						: 'refresh rejected',
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
	// A missing order is looked up again after the previous-version drain report.
	await waitFor(() => expect(mockFind).toHaveBeenCalledTimes(2));
	await drain();
	expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
		attempts: 3,
		missingStarts: 1,
		lastError: 'order_not_resident',
	});
	expect(mockWarn).not.toHaveBeenCalled();
});

it('clears a cancelled contract attempt without completing, receipt, or audit', async () => {
	await owner.recordSaleAttempt(mockContext, {
		order: resident('order', 'pos-open') as never,
		completing: true,
		source: 'gateway-contract',
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

it.each([
	['at its stored status completes', 'pending', [], true],
	['with no stored status stays unpaid', null, [], false],
	[
		'at its stored status but still stamped stays unpaid',
		'pending',
		[{ method_id: 'wcpos_email_invoice', attempt_id: 'a' }],
		false,
	],
] as const)(
	'a gateway attempt found pending %s',
	async (_, settledOrderStatus, stamps, completes) => {
		await owner.recordSaleAttempt(mockContext, {
			order: resident('order', 'pending') as never,
			completing: true,
			source: 'gateway',
			settledOrderStatus,
			settledOrderGateway: 'a',
		});
		mockFind.mockResolvedValue({
			uuid: 'order',
			getLatest: () => ({
				payload: {
					id: 42,
					status: 'pending',
					payment_method: 'a',
					meta_data: stamps.map((value) => ({ key: '_wcpos_awaiting_customer', value })),
					line_items: [],
				},
			}),
		});
		render(<SaleCompletionBridge />);
		if (completes) {
			await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
			expect(owner.completeSale).toHaveBeenCalledWith(
				mockContext,
				expect.objectContaining({ uuid: 'order' }),
				{ source: 'replay', settledOrderStatus: 'pending', settledOrderGateway: 'a' },
				{ host: 'background' }
			);
			// Judged settled before any catch-up: the finish refreshes once, from the store.
			expect(mockCatchUp).not.toHaveBeenCalled();
			expect(mockRefresh).toHaveBeenCalledWith(mockManager, expect.anything(), true, undefined);
			expect(mockReceipt).toHaveBeenCalledWith('order', { select: false });
			expect(mockInfo).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					context: expect.objectContaining({ type: 'checkout.completed', replayed: true }),
				})
			);
		} else {
			await waitFor(async () =>
				expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
					unpaidStarts: 1,
				})
			);
			expect(owner.completeSale).not.toHaveBeenCalled();
			expect(mockCatchUp).toHaveBeenCalledTimes(1);
			expect(mockReceipt).not.toHaveBeenCalled();
		}
	}
);

it.each([
	['through bacs, at the status stored for bacs, completes', 'bacs', true],
	['through a gateway with nothing stored stays unpaid', 'pos_card', false],
] as const)(
	'a pay-page attempt opened for pos_cash and paid %s',
	async (_, paidWith, completes) => {
		// The attempt is journaled at the tender commit, before the pay page opens: the order
		// still carries pos_cash then. The pay page settles it through another gateway, and
		// replay must judge THAT gateway's stored status (#2475 review of the next port).
		const catalog = { pos_cash: null, bacs: 'pending', pos_card: null };
		await owner.recordSaleAttempt(mockContext, {
			order: {
				uuid: 'order',
				getLatest: () => ({
					payload: { id: 42, status: 'pos-open', payment_method: 'pos_cash', meta_data: [] },
				}),
			} as never,
			completing: true,
			source: 'gateway-snapshot',
			settledOrderStatuses: catalog,
		});
		mockFind.mockResolvedValue({
			uuid: 'order',
			getLatest: () => ({
				payload: {
					id: 42,
					status: 'pending',
					payment_method: paidWith,
					meta_data: [],
					line_items: [],
				},
			}),
		});
		render(<SaleCompletionBridge />);
		if (completes) {
			await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
			expect(owner.completeSale).toHaveBeenCalledWith(
				mockContext,
				expect.objectContaining({ uuid: 'order' }),
				{ source: 'replay', settledOrderStatuses: catalog },
				{ host: 'background' }
			);
			expect(mockReceipt).toHaveBeenCalledWith('order', { select: false });
			expect(mockInfo).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					context: expect.objectContaining({ type: 'checkout.completed', replayed: true }),
				})
			);
		} else {
			await waitFor(async () =>
				expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
					unpaidStarts: 1,
				})
			);
			expect(owner.completeSale).not.toHaveBeenCalled();
			expect(mockReceipt).not.toHaveBeenCalled();
		}
	}
);

it.each([{ id: 'A', name: 'Cashier A' }, undefined])(
	'replays the recorded actor %j, never the reopening cashier',
	async (actor) => {
		await owner.recordSaleAttempt(
			{ ...mockContext, actor },
			{ order: resident() as never, completing: true, source: 'gateway-contract' }
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

// A sale the store took but the till could not confirm (`unconfirmed`) keeps its attempt; the
// bridge finishes its receipt and completion audit once the paid order is adopted.
it('an unconfirmed sale is finished by the bridge once the paid order is adopted', async () => {
	await recordCompletionAttempt(mockContext.storeDB, { orderUuid: 'order', source: 'manual' });
	mockCatchUp.mockRejectedValueOnce(new Error('offline'));
	const answer = {
		source: 'manual',
		via: 'online',
		row: { id: 'row-1', amount: '10.00' },
		order: { status: 'completed', balance: '0.00' },
		mirrorFailed: false,
		preparedCompleting: true,
		preLegBalanceMinor: 1000,
		amountMinor: 1000,
	} as unknown as Parameters<typeof owner.completeSale>[2];
	expect(
		await owner.completeSale(mockContext, resident('order', 'pos-open') as never, answer, {
			host: 'stage',
			autoShowReceipt: true,
		})
	).toBe('unconfirmed');
	expect(await pendingCompletions(mockContext.storeDB)).toHaveProperty('order');
	mockFind.mockResolvedValue(resident()); // the paid order is adopted
	render(<SaleCompletionBridge />);
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(mockReceipt).toHaveBeenCalledWith('order', { select: false });
	expect(mockInfo).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			context: expect.objectContaining({ type: 'checkout.completed', replayed: true }),
		})
	);
});

// The same `unconfirmed` sale, finished mid-session: the pull adopts the paid order while the till
// stays up, and the bridge writes the receipt and the audit then, without another recovery run.
it('finishes an unconfirmed sale when a pull adopts the paid order mid-session', async () => {
	mockManager = { engine: { active: () => ({ scopeId: 'scope-1' }) } };
	const adoptions = new Subject<string[]>();
	mockResidentOrders.mockReturnValue(adoptions);
	render(<SaleCompletionBridge />);
	await waitFor(() => expect(mockRecover).toHaveBeenCalledTimes(1));
	await drain();
	await recordCompletionAttempt(mockContext.storeDB, { orderUuid: 'order', source: 'manual' });
	mockCatchUp.mockRejectedValueOnce(new Error('offline'));
	const answer = {
		source: 'manual',
		via: 'online',
		row: { id: 'row-1', amount: '10.00' },
		order: { status: 'completed', balance: '0.00' },
		mirrorFailed: false,
		preparedCompleting: true,
		preLegBalanceMinor: 1000,
		amountMinor: 1000,
	} as unknown as Parameters<typeof owner.completeSale>[2];
	const pos = resident('order', 'pos-open') as never;
	const stage = { host: 'stage', autoShowReceipt: true } as const;
	expect(await owner.completeSale(mockContext, pos, answer, stage)).toBe('unconfirmed');
	expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
		lastError: 'unconfirmed',
		awaitingAdoption: true,
	});
	mockFind.mockResolvedValue(resident()); // the pull adopts the paid order
	act(() => adoptions.next(['order']));
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(mockReceipt).toHaveBeenCalledWith('order', { select: false });
	expect(mockInfo).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({ context: expect.objectContaining({ type: 'checkout.completed' }) })
	);
	expect(mockRecover).toHaveBeenCalledTimes(1);
});

// Codex 4344119710 on #2836: an offline restart's replay fails its refresh and records that error;
// the attempt still awaits adoption, so the pull that adopts the paid order after the reconnect
// finishes it.
it('finishes an unconfirmed sale adopted after an offline restart whose replay failed', async () => {
	await recordCompletionAttempt(mockContext.storeDB, { orderUuid: 'order', source: 'manual' });
	mockCatchUp.mockRejectedValueOnce(new Error('offline'));
	const answer = {
		source: 'manual',
		via: 'online',
		row: { id: 'row-1', amount: '10.00' },
		order: { status: 'completed', balance: '0.00' },
		mirrorFailed: false,
		preparedCompleting: true,
		preLegBalanceMinor: 1000,
		amountMinor: 1000,
	} as unknown as Parameters<typeof owner.completeSale>[2];
	const pos = resident('order', 'pos-open') as never;
	const stage = { host: 'stage', autoShowReceipt: true } as const;
	expect(await owner.completeSale(mockContext, pos, answer, stage)).toBe('unconfirmed');
	// The restart, offline: the replay's refresh of the still-unpaid resident fails.
	mockOnline = 'offline';
	mockManager = { engine: { active: () => ({ scopeId: 'scope-1' }) } };
	const adoptions = new Subject<string[]>();
	mockResidentOrders.mockReturnValue(adoptions);
	mockFind.mockResolvedValue(resident('order', 'pos-open'));
	mockCatchUp.mockRejectedValueOnce(new Error('refresh failed'));
	const view = render(<SaleCompletionBridge />);
	await waitFor(async () =>
		expect((await pendingCompletions(mockContext.storeDB)).order).toMatchObject({
			lastError: 'refresh failed',
			awaitingAdoption: true,
		})
	);
	mockOnline = 'online-website-available';
	view.rerender(<SaleCompletionBridge />);
	await waitFor(() => expect(mockRecover).toHaveBeenCalledTimes(1));
	mockFind.mockResolvedValue(resident()); // the pull adopts the paid order
	act(() => adoptions.next(['order']));
	await waitFor(async () => expect(await pendingCompletions(mockContext.storeDB)).toEqual({}));
	expect(mockReceipt).toHaveBeenCalledWith('order', { select: false });
	expect(mockInfo).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({ context: expect.objectContaining({ type: 'checkout.completed' }) })
	);
});
