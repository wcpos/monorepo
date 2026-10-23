/**
 * @jest-environment jsdom
 */
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { StoreDatabase } from '@wcpos/database';

import { recoverMoneyCommands } from '../src/commands/money-command';
import {
	moneyCommandRecovery,
	RECOVERY_RETRY_DELAYS_MS,
} from '../src/commands/money-command-recovery';
import {
	CLAIM_LEASE_MS,
	claimRoute,
	deferEntry,
	markSent,
	type MoneyCommandEntry,
	releaseClaim,
} from '../src/store-local/money-commands';

import type { QueryRuntime } from '../src/provider';
import type { RxDatabase } from 'rxdb';

jest.mock('../src/commands/money-command', () => ({
	...jest.requireActual('../src/commands/money-command'),
	recoverMoneyCommands: jest.fn(),
}));
addRxPlugin(RxDBLocalDocumentsPlugin);

const mockRecover = jest.mocked(recoverMoneyCommands);
const runtime = { engine: { active: () => ({ scopeId: 'scope-1' }) } } as unknown as QueryRuntime;
let databases: RxDatabase[];
let storeDB: StoreDatabase;
let http: { post: jest.Mock };
let online: boolean;
let sessions: ReturnType<typeof moneyCommandRecovery>[];

const openStoreDB = async () => {
	const db = await createRxDatabase({
		name: `recovery${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	});
	databases.push(db);
	return db as unknown as StoreDatabase;
};
beforeEach(async () => {
	databases = [];
	sessions = [];
	online = true;
	http = { post: jest.fn() };
	mockRecover.mockReset().mockResolvedValue([]);
	storeDB = await openStoreDB();
});
afterEach(async () => {
	for (const session of sessions) session.suspend();
	jest.restoreAllMocks();
	for (const db of databases) await db.remove();
});

const drain = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(predicate: () => boolean, timeout = 1000) {
	const deadline = Date.now() + timeout;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error('timed out waiting for the condition');
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

/**
 * One store session as the bridge drives it: `due` runs `recover` in one serial run queue, and
 * `mount` resumes the recovery and queues the start's run.
 */
function session(db: StoreDatabase = storeDB) {
	let queue: Promise<unknown> = Promise.resolve();
	const run = () => {
		queue = queue.then(() => recovery.recover()).catch(() => undefined);
	};
	const due = jest.fn(run);
	const recovery = moneyCommandRecovery({
		runtime,
		storeDB: db,
		client: () => http,
		online: () => online,
		due,
	});
	sessions.push(recovery);
	return {
		recovery,
		due,
		mount: () => {
			recovery.resume();
			run();
		},
	};
}

const command = (orderUuid: string, id: string, scope = 'scope-1'): MoneyCommandEntry => ({
	orderUuid,
	scope,
	kind: 'close',
	path: 'orders/42/close',
	target: null,
	id,
	body: {},
	approval: { total: '0.00', currency: 'USD' },
	sentAt: null,
	sentRevision: null,
});
const closeRoute = (orderUuid: string) =>
	({ orderUuid, kind: 'close', target: null, rowId: null }) as const;

// A claim persisted by a process that crashed after its send holds the command for the lease:
// the recovery skips it, and is run again when that lease lapses, while the till stays online.
async function claimLapsingIn(ms: number) {
	const real = Date.now();
	const now = jest.spyOn(Date, 'now').mockReturnValue(real - CLAIM_LEASE_MS + ms);
	await claimRoute(storeDB, closeRoute('order'), 'crashed-tab', command('order', 'close-1'));
	await markSent(storeDB, 'order', 'close-1', 'sha256:r1', 'crashed-tab');
	now.mockRestore();
}

/** Record the ladder's delays; `fire` runs its steps at once, else no long timer runs. */
function ladderTimers(fire: boolean) {
	const realSetTimeout = global.setTimeout;
	const delays: number[] = [];
	const handles: unknown[] = [];
	const cleared = jest.spyOn(global, 'clearTimeout');
	const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((
		callback: () => void,
		ms?: number
	) => {
		// Fired, only the ladder's own steps (a claim's lapse keeps its real delay); held, any long
		// timer, so a re-armed step's remaining delay is seen too.
		if (fire ? RECOVERY_RETRY_DELAYS_MS.includes(ms ?? 0) : (ms ?? 0) >= 20_000) {
			delays.push(ms!);
			const handle = realSetTimeout(fire ? callback : () => undefined, 0);
			handles.push(handle);
			return handle;
		}
		return realSetTimeout(callback, ms);
	}) as never);
	return {
		delays,
		/** Recorded steps never cleared: a held step that is still armed. */
		armed: () => handles.filter((h) => !cleared.mock.calls.some(([c]) => c === h)).length,
		restore: () => {
			spy.mockRestore();
			cleared.mockRestore();
		},
	};
}

// A failed send as the poster leaves it: claimed, sent, the claim given up. The claim is stamped
// ahead, so it is never live and schedules no lapse.
async function journalUnanswered(orderUuid: string, claimant: string, scope = 'scope-1') {
	const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5_000);
	const id = `${orderUuid}-close`;
	await claimRoute(storeDB, closeRoute(orderUuid), claimant, command(orderUuid, id, scope));
	await markSent(storeDB, orderUuid, id, 'sha256:r1', claimant);
	await releaseClaim(storeDB, orderUuid, id, claimant);
	now.mockRestore();
}

/** A recovery that answered every command: the journal holds none (the poster settled them). */
async function journalAnswered() {
	await (await storeDB.getLocal('money-commands'))?.remove();
	return [];
}

it('re-runs the recovery when a skipped claim lapses, without a reconnect', async () => {
	await claimLapsingIn(400);
	const { mount, due } = session();
	mount();
	await until(() => mockRecover.mock.calls.length === 1);
	await until(() => mockRecover.mock.calls.length === 2, 3000);
	expect(due).toHaveBeenCalledTimes(1);
});

// The effect re-runs on the same session (a context change, StrictMode): its cleanup suspends the
// recovery and clears the lapse timer, and `resume` must arm it again rather than lose the re-run.
it('keeps the lapse re-run across suspend and resume', async () => {
	await claimLapsingIn(600);
	const { mount, recovery } = session();
	mount();
	await until(() => mockRecover.mock.calls.length === 1);
	await drain();
	recovery.suspend();
	recovery.resume();
	await until(() => mockRecover.mock.calls.length === 2, 3000);
});

// Codex 4344063828 on #2836: a store or site switch while recovery awaits its preflight must not
// send the old journal's command through the new session's client. The send is refused, so the
// poster keeps the command journaled for its own session.
it('refuses a recovery POST once its session is suspended', async () => {
	let preflight!: () => void;
	let sent: Promise<unknown> | undefined;
	mockRecover.mockImplementationOnce(async (_runtime, _db, deps) => {
		await new Promise<void>((resolve) => {
			preflight = resolve;
		});
		sent = deps.post('orders/42/close', {});
		await sent.catch(() => undefined);
		return [];
	});
	const { recovery } = session();
	const run = recovery.recover();
	await until(() => mockRecover.mock.calls.length === 1);
	const before = http;
	http = { post: jest.fn() };
	recovery.suspend();
	preflight();
	await run;
	await expect(sent).rejects.toThrow('money_command_session_stopped');
	expect(before.post).not.toHaveBeenCalled();
	expect(http.post).not.toHaveBeenCalled();
});

// Codex 4344063834 on #2836: a real transient failure releases the poster's claim (the journal
// watch arms a step) and then reports unanswered (the run arms again). Scheduling twice must
// not advance the ladder; only an executed retry does.
it('advances the ladder only when a retry runs, whoever schedules it', async () => {
	const failedResend = async (claimant: string) => {
		await journalUnanswered('order', claimant);
		return [{ orderUuid: 'order', answers: [], unanswered: true as const }];
	};
	const timers = ladderTimers(true);
	try {
		mockRecover
			.mockImplementationOnce(() => failedResend('start'))
			.mockImplementationOnce(() => failedResend('retry-1'))
			.mockImplementation(journalAnswered);
		session().mount();
		await until(() => mockRecover.mock.calls.length === 3);
		await drain();
		expect(timers.delays).toEqual([30_000, 120_000]);
	} finally {
		timers.restore();
	}
});

it('keeps the armed step and its deadline across suspend and resume', async () => {
	mockRecover.mockResolvedValueOnce([{ orderUuid: 'order', answers: [], unanswered: true }]);
	const timers = ladderTimers(false);
	try {
		const { mount, recovery } = session();
		mount();
		await until(() => timers.delays.length === 1);
		expect(timers.delays).toEqual([30_000]);
		recovery.suspend();
		recovery.resume();
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
		session().mount();
		await until(() => mockRecover.mock.calls.length === 3);
		await drain();
		expect(delays).toEqual([30_000, 120_000]);
	} finally {
		timers.mockRestore();
	}
});

// A command whose answers are all lost after the session's first recovery, while the till stays
// online: the watch sees it in the journal and schedules the recovery, so a sale whose tender a
// pull has closed still gets its receipt and audit. Another scope's command waits for that scope:
// the recovery re-sends only the active scope's (Codex 4333124076 on #2798).
it.each([
	['schedules the recovery for', 'scope-1', [RECOVERY_RETRY_DELAYS_MS[0]]],
	['leaves to its scope', 'other-scope', []],
])(
	'%s a command journaled and left unanswered after the session started (%s)',
	async (_, scope, armed) => {
		mockRecover.mockImplementation(journalAnswered);
		const realSetTimeout = global.setTimeout;
		const delays: number[] = [];
		const timers = jest.spyOn(global, 'setTimeout').mockImplementation(((
			callback: () => void,
			ms?: number
		) => {
			// Only the ladder's steps run at once; a claim's lapse (not a step) keeps its delay.
			if (RECOVERY_RETRY_DELAYS_MS.includes(ms ?? 0)) {
				delays.push(ms!);
				return realSetTimeout(callback, 0);
			}
			return realSetTimeout(callback, ms);
		}) as never);
		try {
			session().mount();
			await until(() => mockRecover.mock.calls.length === 1);
			await drain();
			expect(delays).toEqual([]);
			// The tender's send lost its answer: sent, its claim given up.
			await journalUnanswered('order', 'tender', scope);
			await drain();
			await drain();
			await until(() => mockRecover.mock.calls.length === 1 + armed.length);
			expect(delays).toEqual(armed);
		} finally {
			timers.mockRestore();
		}
	}
);

// Codex 4345589102 on #2836: another order's command loses its answer while a run iterates its
// snapshot. The watch arms a retry; the run's clean result must not clear it, since the
// current journal still holds that command.
it('keeps the retry for a command that lost its answer during a recovery run', async () => {
	let finish!: (recovered: Awaited<ReturnType<typeof recoverMoneyCommands>>) => void;
	mockRecover.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			})
	);
	const timers = ladderTimers(false);
	try {
		session().mount();
		await until(() => mockRecover.mock.calls.length === 1);
		await journalUnanswered('other', 'tender');
		await until(() => timers.delays.includes(30_000));
		finish([]);
		await drain();
		await drain();
		expect(timers.armed()).toBe(1);
	} finally {
		timers.restore();
	}
});

// #2871 (Paul, 2026-10-23): the store database is per credential, so a deferred record is
// re-sent only by its own cashier's session, while its scope is active, never by a suspended one.
type DeferredRow = {
	scope: string;
	reports: boolean;
	suspended?: true;
	otherDB?: true;
	owed: boolean;
};
it.each<[string, DeferredRow]>([
	[
		'(a) its own session, online, after a run that reports it unanswered',
		{ scope: 'scope-1', reports: true, owed: true },
	],
	['(b) not another scope', { scope: 'other-scope', reports: false, owed: false }],
	[
		'(c) not a suspended session',
		{ scope: 'scope-1', reports: true, suspended: true, owed: false },
	],
	[
		"(d) not another credential's session (its own store database)",
		{ scope: 'scope-1', reports: false, otherDB: true, owed: false },
	],
])('a deferred record is re-sent only by its own session: %s', async (_, row) => {
	await claimRoute(storeDB, closeRoute('order'), 'tender', command('order', 'close-1', row.scope));
	await deferEntry(storeDB, 'order', 'close-1', 'tender');
	mockRecover
		.mockResolvedValueOnce(
			row.reports ? [{ orderUuid: 'order', answers: [], unanswered: true }] : []
		)
		.mockImplementation(journalAnswered);
	const timers = ladderTimers(true);
	try {
		const { mount, recovery, due } = session(row.otherDB ? await openStoreDB() : storeDB);
		if (row.suspended) {
			recovery.suspend();
			await recovery.recover();
		} else mount();
		await until(() => mockRecover.mock.calls.length >= 1);
		if (row.owed) await until(() => due.mock.calls.length > 0);
		await drain();
		await drain();
		// The first step is the 30 s one; what follows depends on which of the watch and the run
		// armed first, and is pinned by the ladder tests above.
		expect(timers.delays.slice(0, 1)).toEqual(row.owed ? [RECOVERY_RETRY_DELAYS_MS[0]] : []);
		expect(due.mock.calls.length > 0).toBe(row.owed);
	} finally {
		timers.restore();
	}
});

// Codex 4333265115 on #2798: offline nothing can be sent, so a step that comes due fires nothing;
// the reconnect re-runs the recovery. The ladder stays on its step.
it('offline, a ladder step that comes due fires nothing and does not advance the ladder', async () => {
	mockRecover.mockResolvedValueOnce([{ orderUuid: 'order', answers: [], unanswered: true }]);
	const timers = ladderTimers(true);
	try {
		const { recovery, due } = session();
		online = false;
		await recovery.recover();
		await until(() => timers.delays.length === 1);
		await drain();
		expect(due).not.toHaveBeenCalled();
		online = true;
		recovery.resume();
		await until(() => due.mock.calls.length === 1);
		expect(timers.delays).toEqual([30_000, 30_000]);
	} finally {
		timers.restore();
	}
});
