import { afterEach, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { StoreScopeManager } from '@wcpos/sync-core';

import { engineCollectionCreators } from '../collections/engine-collections';
import { memoryEngineStorage, memoryStringStore } from '../testing';
import { type ChangeSignalLaneDeps, createChangeSignalLane } from './change-signal-lane';

import type { EngineTimers } from '../engine-timers';

setPremiumFlag();

// Same deferred pattern as census-publisher.test.ts; only adapter work is held.
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((onResolve) => {
		resolve = onResolve;
	});
	return { promise, resolve };
}

// Drain promise continuations without advancing a clock or sleeping. Positive
// progress uses adapter-entry promises; this drain checks forbidden progress.
async function flushMicrotasks() {
	for (let i = 0; i < 100; i++) await Promise.resolve();
}

function headResponse(head = 40) {
	return Response.json({ checkpoint: { head, epoch: 'first' } });
}

const databases: RxDatabase[] = [];
afterEach(async () => {
	for (const db of databases.splice(0)) await db.remove();
});

async function setup(overrides: Partial<ChangeSignalLaneDeps> = {}, store = memoryStringStore()) {
	const db = await createRxDatabase({
		name: `activation-${crypto.randomUUID()}`,
		storage: memoryEngineStorage(),
		multiInstance: false,
	});
	databases.push(db);
	await db.addCollections(engineCollectionCreators() as Parameters<typeof db.addCollections>[0]);
	const manager =
		overrides.manager ??
		new StoreScopeManager({
			createDatabase: async () => ({
				listCollections: () => Object.keys(db.collections),
				resetCollection: async () => undefined,
				pendingMutationCount: async () => 0,
				close: async () => undefined,
			}),
		});
	const since: number[] = [];
	const readBlob = vi.fn(async (scope: string, key: string) => store.get(`${scope}:${key}`));
	const writeBlob = vi.fn(async (scope: string, key: string, value: string) => {
		await store.set(`${scope}:${key}`, value);
	});
	const server = { head: 40, sequence: undefined as number | undefined };
	const fetcher = vi.fn(async (url: string) => {
		const u = new URL(url);
		if (u.pathname.endsWith('/tick')) return new Response(null, { status: 404 });
		const cursor = Number(u.searchParams.get('since') ?? 0);
		if (u.searchParams.get('limit') !== '1' && u.pathname.endsWith('/sequence-log')) {
			since.push(cursor);
		}
		return Response.json({
			changes: [],
			complete: true,
			checkpoint: {
				since: server.sequence ?? cursor,
				head: server.head,
				epoch: 'first',
				horizon: 0,
			},
			fingerprints: {},
			meta: { supported: false },
		});
	});
	const deadlines = new Map<ReturnType<typeof setTimeout>, () => void>();
	let nextTimer = 0;
	const timers: EngineTimers = {
		setTimeout: (callback) => {
			const handle = ++nextTimer as unknown as ReturnType<typeof setTimeout>;
			deadlines.set(handle, callback);
			return handle;
		},
		clearTimeout: (handle) => {
			deadlines.delete(handle);
		},
		setInterval: () => {
			throw new Error('unexpected interval');
		},
		clearInterval: () => undefined,
		unref: () => undefined,
	};
	const diagnostics = vi.fn();
	const lane = createChangeSignalLane({
		manager,
		databaseFor: () => db,
		fetcher,
		readBlob,
		writeBlob,
		syncBaseUrl: 'https://activation.test',
		connectivity: () => 'online',
		diagnostics,
		emitEvent: () => undefined,
		awaitInitialReady: async () => undefined,
		needsPrime: () => true,
		timers,
		...overrides,
	});
	return {
		lane,
		manager,
		db,
		store,
		readBlob,
		writeBlob,
		fetcher,
		since,
		diagnostics,
		server,
		deadlines,
		expire: async () => {
			await flushMicrotasks();
			expect(deadlines.size).toBe(1);
			[...deadlines.values()][0]();
		},
	};
}

it('fresh head and epoch survive first tick', async () => {
	const h = await setup();
	expect(await h.lane.activated('a')).toEqual({ head: 40, epoch: 'first' });
	const tick = await h.lane.tick();
	expect(tick.status).toBe('ran');
	expect(tick.rebaselined).not.toBe(true);
	expect(h.since).toEqual([40]);
	expect(JSON.parse((await h.readBlob('a', 'checkpoint:change-signal'))!)).toMatchObject({
		cursor: { sequence: 40 },
		epoch: 'first',
	});
});

it('existing checkpoint avoids fetch/write', async () => {
	const h = await setup();
	await h.store.set(
		'a:checkpoint:change-signal',
		JSON.stringify({
			cursor: { sequence: 5 },
			baselineDigests: [],
			epoch: 'first',
		})
	);
	expect(await h.lane.activated('a')).toEqual({ head: 5, epoch: 'first' });
	expect(h.fetcher).not.toHaveBeenCalled();
	expect(h.writeBlob).not.toHaveBeenCalled();
});

it('offline activation defers', async () => {
	const h = await setup({ connectivity: () => 'offline' });
	expect(await h.lane.activated('a')).toBeNull();
	expect(h.fetcher).not.toHaveBeenCalled();
	expect(h.writeBlob).not.toHaveBeenCalled();
});

it('late head after deadline writes nothing', async () => {
	// Removing the post-await cancellation checks would persist this late 90.
	const h = await setup();
	const entered = deferred<void>();
	const answer = deferred<Response>();
	h.fetcher.mockImplementationOnce(() => {
		entered.resolve();
		return answer.promise;
	});
	const activation = h.lane.activated('a');
	await entered.promise;
	await h.expire();
	expect(await activation).toBeNull();
	const admitted = await h.lane.admitted();
	const bootstrap = vi.fn(async () => undefined);
	expect(await admitted.guardWrite(bootstrap)).toBe('applied');
	expect(bootstrap).toHaveBeenCalledOnce();
	answer.resolve(headResponse(90));
	await flushMicrotasks();
	expect(h.writeBlob).not.toHaveBeenCalled();
	expect(await h.readBlob('a', 'checkpoint:change-signal')).toBeNull();
	expect(h.deadlines.size).toBe(0);
	expect(await h.lane.tick()).toMatchObject({ status: 'ran' });
	expect(h.since).toEqual([40]);
});

it('failed activation permits lazy tick recovery', async () => {
	// A rejected fetch must neither seed a checkpoint nor disable later ticks.
	const h = await setup();
	h.fetcher.mockRejectedValueOnce(new Error('transport unavailable'));
	expect(await h.lane.activated('a')).toBeNull();
	expect(await h.readBlob('a', 'checkpoint:change-signal')).toBeNull();
	expect((await h.lane.admitted()).scopeId).toBe('a');
	expect(await h.lane.tick()).toMatchObject({ status: 'ran' });
	expect(h.since).toEqual([40]);
	expect(JSON.parse((await h.readBlob('a', 'checkpoint:change-signal'))!)).toMatchObject({
		cursor: { sequence: 40 },
		epoch: 'first',
	});
});

it('first observed checkpoint wins', async () => {
	// Without the re-read, the second opener replaces the observed cursor 5 with 6.
	const store = memoryStringStore();
	const a = await setup({}, store);
	const b = await setup({}, store);
	const entered = deferred<void>();
	const answer = deferred<Response>();
	b.fetcher.mockImplementationOnce(() => {
		entered.resolve();
		return answer.promise;
	});
	const second = b.lane.activated('a');
	await entered.promise;
	a.server.head = 5;
	expect(await a.lane.activated('a')).toEqual({ head: 5, epoch: 'first' });
	answer.resolve(headResponse(6));
	expect(await second).toEqual({ head: 5, epoch: 'first' });
	expect(b.writeBlob).not.toHaveBeenCalled();
	expect(JSON.parse((await b.readBlob('a', 'checkpoint:change-signal'))!)).toMatchObject({
		cursor: { sequence: 5 },
	});
	expect(await b.lane.tick()).toMatchObject({ status: 'ran' });
	expect(b.since).toEqual([5]);
});

it('own floor survives failed tick until commit', async () => {
	// Both re-reads finish before either write: no atomic first-writer claim.
	// Clearing the floor on construction/failure skips 5..6 on the retry.
	const store = memoryStringStore();
	const a = await setup({}, store);
	const b = await setup({}, store);
	const writing = deferred<void>();
	const finish = deferred<void>();
	b.server.head = 6;
	b.writeBlob.mockImplementationOnce(async (scope, key, value) => {
		writing.resolve();
		await finish.promise;
		await store.set(`${scope}:${key}`, value);
	});
	const second = b.lane.activated('a');
	await writing.promise;
	a.server.head = 5;
	expect(await a.lane.activated('a')).toEqual({ head: 5, epoch: 'first' });
	finish.resolve();
	await second;
	a.server.head = 6;
	a.server.sequence = 6;
	a.writeBlob.mockRejectedValueOnce(new Error('checkpoint write refused'));
	expect(await a.lane.tick()).toMatchObject({ status: 'error' });
	expect(JSON.parse((await a.readBlob('a', 'checkpoint:change-signal'))!)).toMatchObject({
		cursor: { sequence: 6 },
	});
	expect(await a.lane.tick()).toMatchObject({ status: 'ran' });
	a.lane.prune('a');
	expect(await a.lane.tick()).toMatchObject({ status: 'ran' });
	expect(a.since).toEqual([5, 5, 6]);
});

it('hung read releases own reservation', async () => {
	// Admission and a real tick finish while the activation read is still held.
	const h = await setup();
	const reading = deferred<void>();
	const answer = deferred<string | null>();
	h.readBlob.mockImplementationOnce(() => {
		reading.resolve();
		return answer.promise;
	});
	const activation = h.lane.activated('a');
	await reading.promise;
	await h.expire();
	expect(await activation).toBeNull();
	expect((await h.lane.admitted()).scopeId).toBe('a');
	expect(await h.lane.tick()).toMatchObject({ status: 'ran' });
	expect(h.since).toEqual([40]);
	const persisted = await h.readBlob('a', 'checkpoint:change-signal');
	answer.resolve(null);
	await flushMicrotasks();
	expect(await h.readBlob('a', 'checkpoint:change-signal')).toBe(persisted);
	expect(h.writeBlob).toHaveBeenCalledOnce();
});

it('moved scope drops prime', async () => {
	// A transport ignoring abort cannot persist into the scope it left.
	const h = await setup();
	const entered = deferred<void>();
	const answer = deferred<Response>();
	h.fetcher.mockImplementationOnce(() => {
		entered.resolve();
		return answer.promise;
	});
	const activation = h.lane.activated('a');
	await entered.promise;
	await h.manager.switchTo('b');
	answer.resolve(headResponse());
	expect(await activation).toBeNull();
	expect(h.writeBlob).not.toHaveBeenCalled();
	expect(await h.readBlob('a', 'checkpoint:change-signal')).toBeNull();
	expect(await h.readBlob('b', 'checkpoint:change-signal')).toBeNull();
});

it('canceled prime retains predecessor', async () => {
	// Hold the tick's commit, not its poll (the real hybrid serializes polls itself).
	// Releasing the predecessor early lets a second tick fetch before this write settles.
	const h = await setup();
	await h.lane.activated('a');
	const writing = deferred<void>();
	const finish = deferred<void>();
	const write = h.writeBlob.getMockImplementation()!;
	h.writeBlob.mockImplementationOnce(async (scope, key, value) => {
		writing.resolve();
		await finish.promise;
		await write(scope, key, value);
	});
	h.server.head = 41;
	h.server.sequence = 41;
	const first = h.lane.tick();
	await writing.promise;
	const activation = h.lane.activated('a');
	await h.expire();
	expect(await activation).toBeNull();
	h.server.head = 42;
	h.server.sequence = 42;
	const requestsBefore = h.fetcher.mock.calls.length;
	const second = h.lane.tick();
	await flushMicrotasks();
	expect(h.fetcher).toHaveBeenCalledTimes(requestsBefore);
	finish.resolve();
	expect(await first).toMatchObject({ status: 'ran' });
	expect(await second).toMatchObject({ status: 'ran' });
	expect(h.since).toEqual([40, 41]);
	expect(JSON.parse((await h.readBlob('a', 'checkpoint:change-signal'))!)).toMatchObject({
		cursor: { sequence: 42 },
	});
});

it('started write retains reservation', async () => {
	// Deadline releases demand, not the write: otherwise a late prime replaces a tick.
	const h = await setup();
	const writing = deferred<void>();
	const finish = deferred<void>();
	const write = h.writeBlob.getMockImplementation()!;
	h.writeBlob.mockImplementationOnce(async (scope, key, value) => {
		writing.resolve();
		await finish.promise;
		await write(scope, key, value);
	});
	const activation = h.lane.activated('a');
	await writing.promise;
	await h.expire();
	expect(await activation).toBeNull();
	const callback = vi.fn(async () => undefined);
	await (await h.lane.admitted()).guardWrite(callback);
	expect(callback).toHaveBeenCalledOnce();
	h.server.head = 41;
	h.server.sequence = 41;
	const requestsBefore = h.fetcher.mock.calls.length;
	const tick = h.lane.tick();
	await flushMicrotasks();
	expect(h.fetcher).toHaveBeenCalledTimes(requestsBefore);
	finish.resolve();
	expect(await tick).toMatchObject({ status: 'ran' });
	expect(h.since).toEqual([40]);
	expect(JSON.parse((await h.readBlob('a', 'checkpoint:change-signal'))!)).toMatchObject({
		cursor: { sequence: 41 },
	});
});

it('canceled re-read writes nothing', async () => {
	// A stale null re-read must not overwrite a newer real tick's commit.
	const store = memoryStringStore();
	const a = await setup({}, store);
	const b = await setup({}, store);
	const reading = deferred<void>();
	const answer = deferred<string | null>();
	a.readBlob.mockResolvedValueOnce(null).mockImplementationOnce(() => {
		reading.resolve();
		return answer.promise;
	});
	const activation = a.lane.activated('a');
	await reading.promise;
	await a.expire();
	await activation;
	b.server.head = 60;
	await b.lane.activated('a');
	expect(await b.lane.tick()).toMatchObject({ status: 'ran' });
	const committed = await b.readBlob('a', 'checkpoint:change-signal');
	answer.resolve(null);
	await flushMicrotasks();
	expect(a.writeBlob).not.toHaveBeenCalled();
	expect(await a.readBlob('a', 'checkpoint:change-signal')).toBe(committed);
});

it('canceled raced read installs no floor', async () => {
	// A valid late re-read must not install the canceled head 40 below committed 60.
	const store = memoryStringStore();
	const a = await setup({}, store);
	const b = await setup({}, store);
	const reading = deferred<void>();
	const answer = deferred<string | null>();
	a.readBlob.mockResolvedValueOnce(null).mockImplementationOnce(() => {
		reading.resolve();
		return answer.promise;
	});
	const activation = a.lane.activated('a');
	await reading.promise;
	await a.expire();
	await activation;
	b.server.head = 60;
	await b.lane.activated('a');
	expect(await b.lane.tick()).toMatchObject({ status: 'ran' });
	answer.resolve(await b.readBlob('a', 'checkpoint:change-signal'));
	await flushMicrotasks();
	a.server.head = 60;
	a.writeBlob.mockRejectedValueOnce(new Error('checkpoint write refused'));
	expect(await a.lane.tick()).toMatchObject({ status: 'error' });
	expect(await a.lane.tick()).toMatchObject({ status: 'ran' });
	expect(a.since).toEqual([60, 60]);
});

it('HTTP failure warns without checkpointing', async () => {
	// HTTP failures must not manufacture a successful head or escape admission.
	const h = await setup();
	h.fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
	expect(await h.lane.activated('a')).toBeNull();
	expect(h.diagnostics).toHaveBeenCalledWith(
		expect.objectContaining({
			type: 'signal.log',
			level: 'warn',
			message: expect.stringContaining('HTTP 401'),
		})
	);
	expect(h.writeBlob).not.toHaveBeenCalled();
	expect(await h.readBlob('a', 'checkpoint:change-signal')).toBeNull();
	expect((await h.lane.admitted()).scopeId).toBe('a');
	expect(h.deadlines.size).toBe(0);
});

it('initial startup does not self-deadlock', async () => {
	// Activation cannot await startup: startup itself awaits activation.
	const ready = deferred<void>();
	const h = await setup({ awaitInitialReady: () => ready.promise });
	const callback = vi.fn();
	const admission = h.lane.admitted().then(callback);
	expect(await h.lane.activated('a')).toEqual({ head: 40, epoch: 'first' });
	await flushMicrotasks();
	expect(callback).not.toHaveBeenCalled();
	ready.resolve();
	await admission;
	expect(callback).toHaveBeenCalledWith(expect.objectContaining({ scopeId: 'a' }));
});

it('immediate publication cannot bypass activation', async () => {
	// Both a tick and admission requested INSIDE publication must encounter the gate.
	const h = await setup();
	const entered = deferred<void>();
	const answer = deferred<Response>();
	const callback = vi.fn();
	let admission!: ReturnType<typeof h.lane.admitted>;
	let tick!: ReturnType<typeof h.lane.tick>;
	const unsubscribe = h.manager.onEvent((event) => {
		if (event.type !== 'switched') return;
		admission = h.lane.admitted();
		void admission.then(callback);
		tick = h.lane.tick();
	});
	h.fetcher.mockImplementationOnce(() => {
		entered.resolve();
		return answer.promise;
	});
	const activation = h.lane.activated('a');
	await entered.promise;
	await flushMicrotasks();
	expect(callback).not.toHaveBeenCalled();
	expect(h.fetcher).toHaveBeenCalledOnce();
	expect(h.since).toEqual([]);
	answer.resolve(headResponse());
	await activation;
	expect((await admission).scopeId).toBe('a');
	expect(callback).toHaveBeenCalledOnce();
	expect(await tick).toMatchObject({ status: 'ran' });
	expect(h.since).toEqual([40]);
	unsubscribe();
});

it.each([false, true])('failed switch releases admission (outgoing=%s)', async (outgoing) => {
	// Rejecting switchTo must settle admission, with the existing no-scope error if empty.
	const manager = new StoreScopeManager({
		createDatabase: async (scope) => {
			if (scope === 'broken') throw new Error('database open failed');
			return {
				listCollections: () => [],
				resetCollection: async () => undefined,
				pendingMutationCount: async () => 0,
				close: async () => undefined,
			};
		},
	});
	const h = await setup({ manager });
	if (outgoing) await h.lane.activated('a');
	const activation = h.lane.activated('broken');
	const admission = h.lane.admitted();
	const checkedAdmission = outgoing
		? expect(admission).resolves.toMatchObject({ scopeId: 'a' })
		: expect(admission).rejects.toThrow('no active scope');
	await expect(activation).rejects.toThrow('database open failed');
	await checkedAdmission;
	expect(await h.readBlob('broken', 'checkpoint:change-signal')).toBeNull();
});

it('stop before queued activation needs no abort replay', async () => {
	// Stopping before a lifecycle queue starts must suppress that later prime too.
	const h = await setup();
	const queued = deferred<void>();
	const lifecycle = queued.promise.then(() => h.lane.activated('a'));
	h.lane.stopActivation();
	queued.resolve();
	expect(await lifecycle).toBeNull();
	expect((await h.lane.admitted()).scopeId).toBe('a');
	expect(h.fetcher).not.toHaveBeenCalled();
	expect(h.writeBlob).not.toHaveBeenCalled();
	expect(h.deadlines.size).toBe(0);
});

it('admission carries the captured scope across a subsequent switch', async () => {
	// Recapturing after admission would run the callback on successor b instead of dropping it.
	const h = await setup();
	await h.lane.activated('a');
	const bound = await h.lane.admitted();
	const entered = deferred<void>();
	const answer = deferred<Response>();
	h.fetcher.mockImplementationOnce(() => {
		entered.resolve();
		return answer.promise;
	});
	const switching = h.lane.activated('b');
	await entered.promise;
	const callback = vi.fn(async () => undefined);
	expect(bound.scopeId).toBe('a');
	expect(await bound.guardWrite(callback)).toBe('dropped');
	expect(callback).not.toHaveBeenCalled();
	answer.resolve(headResponse(60));
	await switching;
	const successor = await h.lane.admitted();
	expect(successor.scopeId).toBe('b');
	expect(await successor.guardWrite(callback)).toBe('applied');
	expect(callback).toHaveBeenCalledOnce();
});
