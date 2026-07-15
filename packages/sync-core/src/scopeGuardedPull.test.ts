/**
 * runScopeGuardedPull against a REAL StoreScopeManager (stub databases) and
 * fake fetcher/repository/checkpoint store. These pin the scope-safety
 * contract the electron and expo hosts used to wire by hand: one ticket per
 * pull, scoped fetch, guarded document AND checkpoint writes, and the
 * dropped/stale/aborted/error classification.
 *
 * Pull envelopes come from the contract-faithful fake server (fakePullServer.ts,
 * pinned against the PHP pull_orders emit) — not hand-rolled response bodies.
 */

import { describe, expect, it, vi } from 'vitest';

import { normalizeCheckpoint, type PullResponse, type SyncCheckpoint } from './protocol';
import { createFakePullServer, type FakePullServer, fakeUuid } from './fakePullServer';
import { runScopeGuardedPull } from './scopeGuardedPull';
import { type Fetcher, type ScopeDatabase, StoreScopeManager } from './storeScopeManager';

function stubDatabase(): ScopeDatabase {
	return {
		listCollections: () => ['orders', 'mutations'],
		resetCollection: async () => {},
		pendingMutationCount: async () => 0,
		close: async () => {},
	};
}

async function makeManager(): Promise<StoreScopeManager> {
	const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
	await manager.open('scope-a');
	await manager.open('scope-b');
	await manager.switchTo('scope-a');
	return manager;
}

/** Two clean server orders — the standard applied-batch fixture. */
function seededServer(): FakePullServer {
	const server = createFakePullServer();
	server.seed({
		uuid: fakeUuid(1),
		wooOrderId: 1,
		modifiedGmt: '2026-01-01 00:00:00',
		revision: 'r1',
	});
	server.seed({
		uuid: fakeUuid(2),
		wooOrderId: 2,
		modifiedGmt: '2026-01-01 00:00:00',
		revision: 'r2',
	});
	return server;
}

/** The checkpoint the seeded fake advances to (its second row, sequence 2). */
const seededServerCheckpoint: SyncCheckpoint = {
	updatedAtGmt: '2026-01-01 00:00:00',
	orderId: 2,
	revision: 'r2',
	sequence: 2,
};

function fakeRepository() {
	const upserted: PullResponse['documents'][] = [];
	return {
		upserted,
		repository: {
			upsertMany: async (documents: PullResponse['documents']): Promise<void> => {
				upserted.push(documents);
			},
		},
	};
}

function fakeCheckpointStore() {
	const writes: SyncCheckpoint[] = [];
	let checkpoint = normalizeCheckpoint(null);
	return {
		writes,
		store: {
			readCustomPullCheckpoint: async (): Promise<SyncCheckpoint> => checkpoint,
			writeCustomPullCheckpoint: async (next: SyncCheckpoint): Promise<void> => {
				checkpoint = next;
				writes.push(next);
			},
		},
	};
}

describe('runScopeGuardedPull', () => {
	it('applies a batch: scoped fetch, guarded writes, applied count and hasMore from the adapter', async () => {
		const manager = await makeManager();
		const { repository, upserted } = fakeRepository();
		const { store, writes } = fakeCheckpointStore();
		const server = seededServer();
		const fetcher: Fetcher = vi.fn(server.fetch);

		const result = await runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher,
			repository,
			checkpointStore: store,
		});

		expect(result).toEqual({ status: 'applied', applied: 2, hasMore: false });
		expect(upserted).toHaveLength(1);
		expect(upserted[0].map((document) => document.id)).toEqual([fakeUuid(1), fakeUuid(2)]);
		expect(writes).toEqual([seededServerCheckpoint]);
		expect(manager.stats().wrongScopeWrites).toBe(0);
		expect(manager.stats().lateResponsesDropped).toBe(0);
	});

	it('forwards the F8 journal-epoch hooks + resetForResync through the guarded wrappers (Codex P2)', async () => {
		const manager = await makeManager();
		const resetCalls: (ReadonlySet<string | number> | undefined)[] = [];
		const repository = {
			upsertMany: async (): Promise<void> => undefined,
			resetForResync: async (pending?: ReadonlySet<string | number>): Promise<void> => {
				resetCalls.push(pending);
			},
		};
		const epochWrites: string[] = [];
		let storedEpoch: string | undefined = 'epoch-OLD';
		let checkpoint = normalizeCheckpoint({
			updatedAtGmt: 'x',
			orderId: 1,
			revision: 'r',
			sequence: 1,
		});
		const store = {
			readCustomPullCheckpoint: async (): Promise<SyncCheckpoint> => checkpoint,
			writeCustomPullCheckpoint: async (next: SyncCheckpoint): Promise<void> => {
				checkpoint = next;
			},
			readJournalEpoch: async (): Promise<string | undefined> => storedEpoch,
			writeJournalEpoch: async (epoch: string): Promise<void> => {
				storedEpoch = epoch;
				epochWrites.push(epoch);
			},
		};
		// The server carries a NEW epoch → the adapter must resync (reconcile + adopt the epoch); both
		// must reach the underlying repo/store through the scoped wrappers, not be silently dropped.
		const server = createFakePullServer({ epoch: 'epoch-NEW' });

		await runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher: server.fetch,
			repository,
			checkpointStore: store,
		});

		expect(resetCalls).toHaveLength(1); // resetForResync forwarded + guarded
		expect(epochWrites).toEqual(['epoch-NEW']); // writeJournalEpoch forwarded → new generation adopted
	});

	it('forwards includeDeletes to the pull request so the delete hook is reachable (Codex P2)', async () => {
		const manager = await makeManager();
		const { repository } = fakeRepository();
		const { store } = fakeCheckpointStore();
		const server = seededServer();
		const urls: string[] = [];
		const fetcher: Fetcher = async (url, init) => {
			urls.push(String(url));
			return server.fetch(String(url), init ?? undefined);
		};

		await runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher,
			repository,
			checkpointStore: store,
			includeDeletes: true,
		});

		expect(urls[0]).toContain('include_deletes=true');
		expect(server.received[0]?.includeDeletes).toBe(true);
	});

	it('re-resolves the pending provider for the resync purge on a scoped reset (Codex P1)', async () => {
		const manager = await makeManager();
		let providerCalls = 0;
		const provider = async (): Promise<ReadonlySet<string | number>> => {
			providerCalls++;
			return new Set<string | number>();
		};
		const resetCalls: (ReadonlySet<string | number> | undefined)[] = [];
		const repository = {
			upsertMany: async (): Promise<void> => undefined,
			resetForResync: async (pending?: ReadonlySet<string | number>): Promise<void> => {
				resetCalls.push(pending);
			},
		};
		let storedEpoch: string | undefined = 'epoch-OLD';
		let checkpoint = normalizeCheckpoint({
			updatedAtGmt: 'x',
			orderId: 1,
			revision: 'r',
			sequence: 1,
		});
		const store = {
			readCustomPullCheckpoint: async (): Promise<SyncCheckpoint> => checkpoint,
			writeCustomPullCheckpoint: async (next: SyncCheckpoint): Promise<void> => {
				checkpoint = next;
			},
			readJournalEpoch: async (): Promise<string | undefined> => storedEpoch,
			writeJournalEpoch: async (epoch: string): Promise<void> => {
				storedEpoch = epoch;
			},
		};
		const server = createFakePullServer({ epoch: 'epoch-NEW' });

		await runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher: server.fetch,
			repository,
			checkpointStore: store,
			pendingMutationOrderIds: provider, // a provider, so it can be refreshed for the destructive purge
		});

		expect(providerCalls).toBe(2); // once pre-fetch, once as the fresh read for the reset purge
		expect(resetCalls).toHaveLength(1); // resetForResync ran with the freshly-resolved set
	});

	it('passes pendingMutationOrderIds through: pulled documents with queued mutations are skipped', async () => {
		const manager = await makeManager();
		const { repository, upserted } = fakeRepository();
		const { store } = fakeCheckpointStore();
		const server = seededServer();

		const result = await runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher: server.fetch,
			repository,
			checkpointStore: store,
			pendingMutationOrderIds: new Set([1]),
		});

		expect(result.status).toBe('applied');
		expect(result.applied).toBe(1);
		expect(upserted[0].map((document) => document.id)).toEqual([fakeUuid(2)]);
	});

	it('accepts a pendingMutationOrderIds provider, resolved under the pull ticket', async () => {
		const manager = await makeManager();
		const { repository, upserted } = fakeRepository();
		const { store } = fakeCheckpointStore();
		const server = seededServer();

		const result = await runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher: server.fetch,
			repository,
			checkpointStore: store,
			pendingMutationOrderIds: async () => new Set([2]),
		});

		expect(result.status).toBe('applied');
		expect(result.applied).toBe(1);
		expect(upserted[0].map((document) => document.id)).toEqual([fakeUuid(1)]);
	});

	it('drops the pull when the scope switches during the pendingMutationOrderIds read', async () => {
		const manager = await makeManager();
		const { repository, upserted } = fakeRepository();
		const { store, writes } = fakeCheckpointStore();
		const server = seededServer();
		const fetcher: Fetcher = vi.fn(server.fetch);

		// The ticket is issued synchronously at call time, so a switch landing
		// during the async pending-mutation read stales it. With fetches bound
		// to the ORIGINAL ticket, the stale pull refuses to start network work
		// at all — 'aborted' with zero fetches and zero writes.
		const result = await runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher,
			repository,
			checkpointStore: store,
			pendingMutationOrderIds: async () => {
				await manager.switchTo('scope-b');
				return new Set<string | number>();
			},
		});

		expect(result.status).toBe('aborted');
		expect(result.applied).toBe(0);
		expect(upserted).toHaveLength(0);
		expect(writes).toHaveLength(0);
	});

	it('switch mid-pull aborts the in-flight fetch: status aborted, nothing written', async () => {
		const manager = await makeManager();
		const { repository, upserted } = fakeRepository();
		const { store, writes } = fakeCheckpointStore();
		let fetchStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			fetchStarted = resolve;
		});
		// A signal-honoring fetcher: rejects with an AbortError when the ticket
		// signal fires, like real fetch.
		const fetcher: Fetcher = (_url, init) =>
			new Promise<Response>((_resolve, reject) => {
				fetchStarted?.();
				init?.signal?.addEventListener('abort', () => {
					reject(new DOMException('The operation was aborted.', 'AbortError'));
				});
			});

		const racing = runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher,
			repository,
			checkpointStore: store,
		});
		await started;
		await manager.switchTo('scope-b');
		const result = await racing;

		expect(result.status).toBe('aborted');
		expect(result.applied).toBe(0);
		expect(result.hasMore).toBeNull();
		expect(upserted).toHaveLength(0);
		expect(writes).toHaveLength(0);
	});

	it('late response after a switch is stale: scopedFetch drops it, write never invoked', async () => {
		const manager = await makeManager();
		const { repository, upserted } = fakeRepository();
		const { store, writes } = fakeCheckpointStore();
		const server = seededServer();
		let release: ((response: Response) => void) | undefined;
		let requestedUrl: string | undefined;
		let fetchStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			fetchStarted = resolve;
		});
		// Ignores the abort signal and resolves anyway — the late-HTTP-response
		// production failure scopedFetch exists to catch.
		const fetcher: Fetcher = (url) =>
			new Promise<Response>((resolve) => {
				requestedUrl = String(url);
				fetchStarted?.();
				release = resolve;
			});

		const racing = runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher,
			repository,
			checkpointStore: store,
		});
		await started;
		await manager.switchTo('scope-b');
		release?.(await server.fetch(requestedUrl as string)); // the fake's real envelope, landing late
		const result = await racing;

		expect(result.status).toBe('stale');
		expect(result.detail).toContain('ScopeStaleError');
		expect(upserted).toHaveLength(0);
		expect(writes).toHaveLength(0);
		expect(manager.stats().lateResponsesDropped).toBe(1);
	});

	it('spans one capture across fetch, document write, and checkpoint guard', async () => {
		const manager = await makeManager();
		const writes: SyncCheckpoint[] = [];
		let releaseUpsert: (() => void) | undefined;
		let upsertStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			upsertStarted = resolve;
		});
		const upserted: PullResponse['documents'][] = [];
		// The document write passes the guard, then the scope switches BEFORE the
		// checkpoint write — the checkpoint must be dropped, not persisted.
		const repository = {
			upsertMany: async (documents: PullResponse['documents']): Promise<void> => {
				upserted.push(documents);
				upsertStarted?.();
				await new Promise<void>((resolve) => {
					releaseUpsert = resolve;
				});
			},
		};
		const server = seededServer();
		const checkpointStore = {
			readCustomPullCheckpoint: async (): Promise<SyncCheckpoint> => normalizeCheckpoint(null),
			writeCustomPullCheckpoint: async (next: SyncCheckpoint): Promise<void> => {
				writes.push(next);
			},
		};

		const racing = runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher: server.fetch,
			repository,
			checkpointStore,
		});
		await started;
		const switching = manager.switchTo('scope-b'); // bumps epoch, then drains the in-flight upsert
		releaseUpsert?.();
		await switching;
		const result = await racing;

		expect(result.status).toBe('dropped');
		expect(result.applied).toBe(0);
		expect(result.hasMore).toBeNull();
		expect(upserted).toHaveLength(1); // the document write was already in flight when the switch landed
		expect(writes).toHaveLength(0); // the checkpoint never persisted
		expect(manager.stats().wrongScopeWrites).toBe(1);
		expect(manager.stats().lateResponsesDropped).toBe(0); // response landed before the switch; the write guard made the verdict
	});

	it('reports applied when the scope switches after the checkpoint has committed', async () => {
		const manager = await makeManager();
		const { repository, upserted } = fakeRepository();
		const server = seededServer();
		const writes: SyncCheckpoint[] = [];
		let switching: Promise<{ scopeId: string; epoch: number }> | undefined;
		const checkpointStore = {
			readCustomPullCheckpoint: async (): Promise<SyncCheckpoint> => normalizeCheckpoint(null),
			writeCustomPullCheckpoint: async (next: SyncCheckpoint): Promise<void> => {
				writes.push(next);
				switching = manager.switchTo('scope-b');
				// Let the switch bump the epoch after this write has committed. The
				// lifecycle drain then waits for the already-admitted pull write.
				await Promise.resolve();
			},
		};

		const result = await runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher: server.fetch,
			repository,
			checkpointStore,
		});
		await switching;

		expect(result).toEqual({ status: 'applied', applied: 2, hasMore: false });
		expect(upserted).toHaveLength(1);
		expect(writes).toEqual([seededServerCheckpoint]);
		expect(manager.stats().wrongScopeWrites).toBe(0);
	});

	it("classifies a DOMException-like plain object {name: 'AbortError'} as aborted", async () => {
		const manager = await makeManager();
		const { repository, upserted } = fakeRepository();
		const { store } = fakeCheckpointStore();
		// Some runtimes' DOMException does not extend Error — classification must
		// go by name, not instanceof.
		const fetcher: Fetcher = async () => {
			throw { name: 'AbortError' };
		};

		const result = await runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher,
			repository,
			checkpointStore: store,
		});

		expect(result.status).toBe('aborted');
		expect(upserted).toHaveLength(0);
	});

	it('classifies other failures as error with detail', async () => {
		const manager = await makeManager();
		const { repository } = fakeRepository();
		const { store, writes } = fakeCheckpointStore();
		const server = seededServer();
		server.script(() => ({ kind: 'error_5xx' })); // the WP 500 HTML error page

		const result = await runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 50,
			fetcher: server.fetch,
			repository,
			checkpointStore: store,
		});

		expect(result.status).toBe('error');
		expect(result.applied).toBe(0);
		expect(result.detail).toContain('Custom pull failed: 500');
		expect(writes).toHaveLength(0);
	});
});

describe('ticket-bound fetching (stale pulls refuse network work)', () => {
	it('never sends a fetch when the scope switched during the pending-ids provider', async () => {
		const manager = await makeManager();
		const fetchSpy = vi.fn<Fetcher>();
		const { repository, upserted } = fakeRepository();
		const { store } = fakeCheckpointStore();

		const result = await runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 10,
			fetcher: fetchSpy,
			repository,
			checkpointStore: store,
			pendingMutationOrderIds: async () => {
				await manager.switchTo('scope-b');
				return new Set<string | number>();
			},
		});

		expect(result.status).toBe('aborted');
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(upserted).toHaveLength(0);
	});

	it('classifies a response landing after a switch as stale, write never invoked', async () => {
		const manager = await makeManager();
		const { repository, upserted } = fakeRepository();
		const { store } = fakeCheckpointStore();
		const server = createFakePullServer(); // empty journal: a valid empty envelope, landing late
		let requestedUrl: string | undefined;
		let resolveFetch: (r: Response) => void = () => {};
		const fetcher: Fetcher = (url) =>
			new Promise<Response>((resolve) => {
				requestedUrl = String(url);
				resolveFetch = resolve;
			});

		const pull = runScopeGuardedPull({
			manager,
			baseUrl: 'http://test.local/wp-json/wcpos/v2',
			limit: 10,
			fetcher,
			repository,
			checkpointStore: store,
		});
		await Promise.resolve();
		await manager.switchTo('scope-b');
		resolveFetch(await server.fetch(requestedUrl as string));
		const result = await pull;

		expect(['stale', 'aborted', 'dropped']).toContain(result.status);
		expect(upserted).toHaveLength(0);
	});
});
