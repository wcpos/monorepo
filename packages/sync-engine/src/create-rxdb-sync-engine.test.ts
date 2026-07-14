/**
 * Slice-2 conformance: the scope lifecycle driven ENTIRELY through the public
 * handle against the /testing adapters (ADR 0018: the interface is the test
 * surface — no backdoor). A→B→A switch and reset semantics are the ticket's
 * done-criterion (#427).
 */

import { describe, expect, it, vi } from 'vitest';
// Premium stays host-side (ADR 0018) — and this TEST HARNESS is the host.
// Open-source RxDB caps open collections at 13 across all databases in the
// process; the engine recipe is 11 per scope, so any two-scope test needs
// the flag. devDependency only — the engine's runtime never imports premium.
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { normalizeCheckpoint, scopeDatabaseName, scopeKeyFor } from '@wcpos/sync-core';

import {
	createRxdbSyncEngine,
	type EngineEvent,
	type RxdbSyncEnginePorts,
	type StoreScopeIdentity,
} from './create-rxdb-sync-engine';
import { memoryEngineStorage, memoryStringStore, scriptedConnectivity } from './testing';
import { EngineOrderRepository } from './write-path/engine-order-repository';

setPremiumFlag();

const SITE = 'https://lab.example.test';

let uniqueStore = 0;

function identityFor(cashierId: string, storeId = 1): StoreScopeIdentity {
	return { site: SITE, storeId, cashierId };
}

/** Unique per test — memory storage persists per database name in-process. */
function freshIdentities(): { a: StoreScopeIdentity; b: StoreScopeIdentity } {
	uniqueStore += 1;
	return {
		a: identityFor(`cashier-a-${uniqueStore}`),
		b: identityFor(`cashier-b-${uniqueStore}`),
	};
}

function engineWith(overrides?: Partial<RxdbSyncEnginePorts>, initial?: StoreScopeIdentity) {
	const ports: RxdbSyncEnginePorts = {
		site: { syncBaseUrl: `${SITE}/wp-json/wc-rxdb-sync/v1`, wpJsonRoot: `${SITE}/wp-json` },
		storage: memoryEngineStorage(),
		...overrides,
	};
	return createRxdbSyncEngine(ports, initial ?? freshIdentities().a);
}

async function insertOrder(
	db: { collections: Record<string, unknown> },
	id: string
): Promise<void> {
	const orders = db.collections.orders as {
		insert(doc: Record<string, unknown>): Promise<unknown>;
	};
	await orders.insert({
		id,
		wooOrderId: 1,
		number: '1001',
		dateCreatedGmt: '2026-07-09T00:00:00',
		status: 'processing',
		total: '10.00',
		customerId: 0,
		payload: { id: 1, status: 'processing' },
		sync: {},
		local: {},
	});
}

async function countOrders(db: { collections: Record<string, unknown> }): Promise<number> {
	const orders = db.collections.orders as { count(): { exec(): Promise<number> } };
	return orders.count().exec();
}

async function enqueueMutation(
	db: { collections: Record<string, unknown> },
	mutationId: string
): Promise<void> {
	const mutations = db.collections.recordMutations as {
		insert(doc: Record<string, unknown>): Promise<unknown>;
	};
	await mutations.insert({
		mutationId,
		seq: 1,
		status: 'pending',
		recordId: 'order:1',
		collectionName: 'orders',
		operation: 'create',
		payload: {},
		queuedAt: '2026-07-09T00:00:00.000Z',
	});
}

describe('createRxdbSyncEngine — slice 2 scope lifecycle', () => {
	it('ready resolves the initial scope: ADR 0013 scope id and database name', async () => {
		const { a } = freshIdentities();
		const engine = engineWith(undefined, a);
		const scope = await engine.ready;
		expect(scope.scopeId).toBe(scopeKeyFor(a));
		expect(scope.identity).toEqual(a);
		expect(scope.database.name).toBe(scopeDatabaseName(a));
		expect(engine.active()?.scopeId).toBe(scope.scopeId);
		await engine.dispose();
	});

	it('A→B→A switch is pause/resume: every scope keeps its data and mutation queue', async () => {
		const { a, b } = freshIdentities();
		const engine = engineWith(undefined, a);
		const scopeA = await engine.ready;
		await insertOrder(scopeA.database, 'order-a');
		await enqueueMutation(scopeA.database, 'mutation-a');

		const scopeB = await engine.scope.switch(b);
		expect(scopeB.scopeId).toBe(scopeKeyFor(b));
		expect(scopeB.database).not.toBe(scopeA.database);
		expect(await countOrders(scopeB.database)).toBe(0);
		await insertOrder(scopeB.database, 'order-b');

		const scopeA2 = await engine.scope.switch(a);
		expect(scopeA2.database).toBe(scopeA.database); // pause/resume, never teardown
		expect(await countOrders(scopeA2.database)).toBe(1);
		const pending = scopeA2.database.collections.recordMutations as {
			count(): { exec(): Promise<number> };
		};
		expect(await pending.count().exec()).toBe(1);
		expect(engine.status().scopesOpen).toBe(2);
		await engine.dispose();
	});

	it('db$ emits the current database immediately, then on every switch', async () => {
		const { a, b } = freshIdentities();
		const engine = engineWith(undefined, a);
		await engine.ready;
		const seen: (string | null)[] = [];
		const unsubscribe = engine.db$((db) => seen.push(db ? db.name : null));
		expect(seen).toEqual([scopeDatabaseName(a)]);
		await engine.scope.switch(b);
		await engine.scope.switch(a);
		expect(seen).toEqual([scopeDatabaseName(a), scopeDatabaseName(b), scopeDatabaseName(a)]);
		unsubscribe();
		await engine.scope.switch(b);
		expect(seen).toHaveLength(3);
		await engine.dispose();
	});

	it('switching to the already-active scope is a no-op (no event, no re-emit)', async () => {
		const { a } = freshIdentities();
		const engine = engineWith(undefined, a);
		await engine.ready;
		const events: EngineEvent[] = [];
		engine.events((event) => events.push(event));
		await engine.scope.switch(a);
		expect(events).toHaveLength(0);
		await engine.dispose();
	});

	it('cross-site switch is an exception — multi-site is a new engine', async () => {
		const { a } = freshIdentities();
		const engine = engineWith(undefined, a);
		await engine.ready;
		await expect(
			engine.scope.switch({ site: 'https://other-site.example.test', storeId: 1, cashierId: 'x' })
		).rejects.toThrow(/cross-site/i);
		// Site spelling variants are the SAME site, not cross-site.
		const respelled = await engine.scope.switch({
			site: 'HTTP://lab.example.test/',
			storeId: 1,
			cashierId: a.cashierId,
		});
		expect(respelled.scopeId).toBe(scopeKeyFor(a));
		await engine.dispose();
	});

	it('resetCollection empties exactly the named collection and leaves the rest', async () => {
		const { a } = freshIdentities();
		const engine = engineWith(undefined, a);
		const scope = await engine.ready;
		await insertOrder(scope.database, 'order-1');
		await enqueueMutation(scope.database, 'mutation-1');
		const events: EngineEvent[] = [];
		engine.events((event) => events.push(event));

		const outcome = await engine.scope.resetCollection('orders');
		expect(outcome).toBe('reset');
		expect(await countOrders(scope.database)).toBe(0);
		const pending = scope.database.collections.recordMutations as {
			count(): { exec(): Promise<number> };
		};
		expect(await pending.count().exec()).toBe(1); // queue untouched by a data reset
		expect(events).toContainEqual({
			type: 'collection-reset',
			scopeId: scope.scopeId,
			collection: 'orders',
		});
		await engine.dispose();
	});

	it('resetCollection clears exactly the matching checkpoint in a host-provided store', async () => {
		const { a } = freshIdentities();
		const checkpoints = memoryStringStore();
		const engine = engineWith({ checkpoints }, a);
		const scope = await engine.ready;
		// The HOST owns the store — seeding it is host-side state, not a backdoor.
		await checkpoints.set(`${scope.scopeId}:checkpoint:orders`, '{"cursor":42}');
		await checkpoints.set(`${scope.scopeId}:checkpoint:products`, '{"cursor":7}');

		await engine.scope.resetCollection('orders');
		expect(await checkpoints.get(`${scope.scopeId}:checkpoint:orders`)).toBeNull();
		expect(await checkpoints.get(`${scope.scopeId}:checkpoint:products`)).toBe('{"cursor":7}');
		await engine.dispose();
	});

	it("resetCollection('orders') rewinds the syncCheckpoints custom-pull checkpoint — the persisted drain's cursor store (#430 phase 2)", async () => {
		const { a } = freshIdentities();
		const engine = engineWith(undefined, a);
		const scope = await engine.ready;
		const repository = new EngineOrderRepository(scope.database as never);
		const saved = normalizeCheckpoint({
			sequence: 42,
			orderId: 7,
			updatedAtGmt: '2026-07-01T00:00:00.000Z',
			revision: 'r42',
		});
		await repository.writeCustomPullCheckpoint(saved);

		await engine.scope.resetCollection('orders');

		// Resolved ⇒ the cursor already rewound (invariant 2): a stale non-zero
		// checkpoint over the emptied orders collection would silently skip rows.
		expect(await repository.readCustomPullCheckpoint()).toEqual(normalizeCheckpoint(null));

		// A PRODUCTS reset leaves the orders cursor alone.
		await repository.writeCustomPullCheckpoint(saved);
		await engine.scope.resetCollection('products');
		expect(await repository.readCustomPullCheckpoint()).toEqual(saved);
		await engine.dispose();
	});

	it('plain switching never clears checkpoints — cursors survive pause/resume', async () => {
		const { a, b } = freshIdentities();
		const checkpoints = memoryStringStore();
		const engine = engineWith({ checkpoints }, a);
		const scope = await engine.ready;
		await checkpoints.set(`${scope.scopeId}:checkpoint:orders`, '{"cursor":42}');
		await engine.scope.switch(b);
		await engine.scope.switch(a);
		expect(await checkpoints.get(`${scope.scopeId}:checkpoint:orders`)).toBe('{"cursor":42}');
		await engine.dispose();
	});

	it("resetCollection('mutations') with pending mutations is a VALUE: needs-confirmation, queue intact", async () => {
		const { a } = freshIdentities();
		const engine = engineWith(undefined, a);
		const scope = await engine.ready;
		await enqueueMutation(scope.database, 'mutation-1');
		const events: EngineEvent[] = [];
		engine.events((event) => events.push(event));
		const refusedBeforeDrop = vi.fn(async () => undefined);

		const refused = await engine.scope.resetCollection('mutations', {
			beforeDrop: refusedBeforeDrop,
		});
		expect(refused).toBe('needs-confirmation');
		expect(refusedBeforeDrop).not.toHaveBeenCalled();
		const pending = scope.database.collections.recordMutations as {
			count(): { exec(): Promise<number> };
		};
		expect(await pending.count().exec()).toBe(1);
		expect(events.some((event) => event.type === 'reset-needs-confirmation')).toBe(true);

		const confirmedBeforeDrop = vi.fn(async (active: typeof scope) => {
			const live = active.database.collections.recordMutations as {
				count(): { exec(): Promise<number> };
			};
			expect(await live.count().exec()).toBe(1);
		});
		const confirmed = await engine.scope.resetCollection('mutations', {
			confirmDestroyQueue: true,
			beforeDrop: confirmedBeforeDrop,
		});
		expect(confirmed).toBe('reset');
		expect(confirmedBeforeDrop).toHaveBeenCalledOnce();
		// References captured before a reset are stale by contract — re-resolve.
		const recreated = scope.database.collections.recordMutations as {
			count(): { exec(): Promise<number> };
		};
		expect(await recreated.count().exec()).toBe(0);
		await engine.dispose();
	});

	it('unknown collection is an exception (caller misuse), not a value', async () => {
		const { a } = freshIdentities();
		const engine = engineWith(undefined, a);
		await engine.ready;
		await expect(engine.scope.resetCollection('engineKv' as never)).rejects.toThrow(
			/unknown collection/i
		);
		await engine.dispose();
	});

	it('dispose is terminal: scope dbs close, further calls reject, active() is null', async () => {
		const { a, b } = freshIdentities();
		const engine = engineWith(undefined, a);
		await engine.ready;
		await engine.scope.switch(b);
		const emitted: (string | null)[] = [];
		engine.db$((db) => emitted.push(db ? db.name : null));

		await engine.dispose();
		expect(emitted.at(-1)).toBeNull();
		expect(engine.active()).toBeNull();
		expect(engine.status().disposed).toBe(true);
		expect(engine.status().activeScopeId).toBeNull();
		await expect(engine.dispose()).rejects.toThrow(/disposed/);
		await expect(engine.scope.switch(a)).rejects.toThrow(/disposed/);
		await expect(engine.scope.resetCollection('orders')).rejects.toThrow(/disposed/);
		expect(() => engine.db$(() => undefined)).toThrow(/disposed/);
		expect(() => engine.events(() => undefined)).toThrow(/disposed/);
	});

	it('status() reports the scripted connectivity and zeroed guard counters', async () => {
		const { a } = freshIdentities();
		const connectivity = scriptedConnectivity('online');
		const engine = engineWith({ connectivity: connectivity.signal, mode: 'manual' }, a);
		await engine.ready;
		expect(engine.status()).toMatchObject({
			disposed: false,
			mode: 'manual',
			connectivity: 'online',
			guards: { wrongScopeWrites: 0, lateResponsesDropped: 0 },
		});
		connectivity.set('offline');
		expect(engine.status().connectivity).toBe('offline');
		await engine.dispose();
	});

	it('fails closed when the connectivity adapter throws', async () => {
		const diagnostics = vi.fn();
		const engine = engineWith({
			mode: 'manual',
			connectivity: () => {
				throw new Error('adapter boom');
			},
			diagnostics,
		});
		await engine.ready;
		expect(engine.status()).toMatchObject({ connectivity: 'offline', gatedBy: 'offline' });
		await expect(engine.sync('write-drain')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'offline',
		});
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'engine.connectivity-error' })
		);
		await engine.dispose();
	});

	it('sync() without a lane ticks every registered lane in the documented order', async () => {
		let now = 1_000;
		const engine = engineWith({
			mode: 'manual',
			now: () => ++now,
			fetcher: async () => new Response('{}', { status: 500 }),
		});
		await engine.ready;

		await engine.sync();

		const ticks = Object.values(engine.status().lanes).map((lane) => lane.lastTick?.atMs ?? 0);
		expect(ticks).toHaveLength(10);
		expect(ticks.every((tick) => tick > 0)).toBe(true);
		expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
		await engine.dispose();
	});

	it('gate2 #516 item 6: the seed lanes tick BEFORE the scheduler drain in a full sync() — no self-seeded work left pending', async () => {
		let now = 1_000;
		const engine = engineWith({
			mode: 'manual',
			now: () => ++now,
			fetcher: async () => new Response('{}', { status: 500 }),
		});
		await engine.ready;

		await engine.sync();

		// The seeds only ENQUEUE persisted tasks; running them after the drain
		// (the pre-fix order) meant a manual sync() returned 'ran' with its own
		// just-seeded work still pending until some later tick.
		const lanes = engine.status().lanes;
		expect(lanes['order-window-seed'].lastTick!.atMs).toBeLessThan(
			lanes['scheduler-drain'].lastTick!.atMs
		);
		expect(lanes['reference-seed'].lastTick!.atMs).toBeLessThan(
			lanes['scheduler-drain'].lastTick!.atMs
		);
		expect(lanes['write-drain'].lastTick!.atMs).toBeLessThan(
			lanes['order-window-seed'].lastTick!.atMs
		);
		await engine.dispose();
	});

	it('projects host-facing scope events and guard stats without exposing engine event names', async () => {
		const { a, b } = freshIdentities();
		const engine = engineWith(undefined, a);
		await engine.ready;
		const events: { type: string; scopeId: string; collection?: string }[] = [];
		const unsubscribe = engine.onScopeEvent((event) => events.push(event));

		const scopeB = await engine.scope.switch(b);
		await engine.scope.resetCollection('orders');

		expect(events).toEqual([
			{ type: 'switched', scopeId: scopeB.scopeId },
			{ type: 'reset', scopeId: scopeB.scopeId, collection: 'orders' },
		]);
		expect(engine.stats()).toEqual({
			scopesOpen: 2,
			wrongScopeWrites: 0,
			lateResponsesDropped: 0,
		});
		unsubscribe();
		await engine.scope.switch(a);
		expect(events).toHaveLength(2);
		await engine.dispose();
	});

	it('a throwing diagnostics observer or events listener never breaks the engine', async () => {
		const { a, b } = freshIdentities();
		const engine = engineWith(
			{
				diagnostics: () => {
					throw new Error('observer boom');
				},
			},
			a
		);
		await engine.ready;
		engine.events(() => {
			throw new Error('listener boom');
		});
		const scope = await engine.scope.switch(b);
		expect(scope.scopeId).toBe(scopeKeyFor(b));
		await engine.dispose();
	});

	it('a reset racing a pending switch resets the FIFO-settled scope, never the outgoing one', async () => {
		const { a, b } = freshIdentities();
		const engine = engineWith(undefined, a);
		const scopeA = await engine.ready;
		await insertOrder(scopeA.database, 'order-a');
		const events: EngineEvent[] = [];
		engine.events((event) => events.push(event));

		// Enqueue switch(b) and reset without awaiting between them: the reset's
		// FIFO turn comes after the switch, so it must target scope B.
		const switching = engine.scope.switch(b);
		const resetting = engine.scope.resetCollection('orders');
		const [scopeB, outcome] = await Promise.all([switching, resetting]);
		expect(outcome).toBe('reset');
		expect(events).toContainEqual({
			type: 'collection-reset',
			scopeId: scopeB.scopeId,
			collection: 'orders',
		});
		// Scope A — the scope that was active when reset was CALLED — is untouched.
		expect(await countOrders(scopeA.database)).toBe(1);
		await engine.dispose();
	});

	it('dispose racing a pending switch closes the scope that switch opened', async () => {
		const { a, b } = freshIdentities();
		const engine = engineWith(undefined, a);
		await engine.ready;
		const switching = engine.scope.switch(b);
		const disposing = engine.dispose();
		await Promise.all([switching, disposing]);
		expect(engine.status().scopesOpen).toBe(0);
		expect(engine.active()).toBeNull();
	});

	it('lifecycle ops serialize: interleaved switches settle FIFO with a coherent end state', async () => {
		const { a, b } = freshIdentities();
		const engine = engineWith(undefined, a);
		await engine.ready;
		const [toB, backToA] = await Promise.all([engine.scope.switch(b), engine.scope.switch(a)]);
		expect(toB.scopeId).toBe(scopeKeyFor(b));
		expect(backToA.scopeId).toBe(scopeKeyFor(a));
		expect(engine.active()?.scopeId).toBe(scopeKeyFor(a));
		await engine.dispose();
	});
});
