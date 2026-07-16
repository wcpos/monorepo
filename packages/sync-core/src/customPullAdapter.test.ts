import { describe, expect, it, vi } from 'vitest';

import { normalizeCheckpoint, type PullResponse } from './protocol';
import {
	CustomPullPoisonError,
	measuredResponseBytes,
	pullCustomBatch,
	shouldApplyPulledDocument,
	syncCustomPullBatchIntoRepository,
	syncCustomPullIntoRepository,
} from './customPullAdapter';
import { createFakePullServer, fakeUuid } from './fakePullServer';

// Pull fixtures come from the contract-faithful fake server (fakePullServer.ts, pinned against the
// PHP pull_orders emit in fakePullServer.test.ts) — not hand-rolled envelopes that can drift from
// what the PHP actually sends. The one deliberate exception is the duplicate-id dedup test below,
// which fakes an OFF-contract page the real server never emits (client defense in depth).
function response(body: unknown, headers: HeadersInit = {}) {
	return new Response(JSON.stringify(body), { status: 200, headers });
}

const BASE_URL = 'http://wcpos.local/wp-json/wcpos/v2';

describe('pullCustomBatch', () => {
	it('posts checkpoint parameters and returns documents', async () => {
		const server = createFakePullServer();
		server.seed({
			uuid: fakeUuid(1),
			wooOrderId: 1,
			sequence: 1,
			modifiedGmt: '2026-05-19 00:00:00',
			revision: 'rev',
		});
		const fetcher = vi.fn(server.fetch);

		const result = await pullCustomBatch({
			baseUrl: BASE_URL,
			checkpoint: null,
			limit: 50,
			fetcher,
		});

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/orders/pull?limit=50&updated_at_gmt=1970-01-01T00%3A00%3A00.000Z&order_id=0&sequence=0'
		);
		expect(result.documents).toHaveLength(1);
		expect(result.metrics?.duration_ms).toBe(7); // the fake's deterministic body metrics, surfaced verbatim
		expect(result.responseBytes).toBe(
			new TextEncoder().encode(server.responseBodies[0]).byteLength
		);
	});

	it('passes the abort signal to the custom pull fetcher', async () => {
		const abortController = new AbortController();
		const server = createFakePullServer();
		const fetcher = vi.fn(server.fetch);

		await pullCustomBatch({
			baseUrl: BASE_URL,
			checkpoint: null,
			limit: 50,
			fetcher,
			signal: abortController.signal,
		});

		expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/orders/pull?'), {
			signal: abortController.signal,
		});
	});

	it('measures response bytes from the body when content-length is absent', async () => {
		const server = createFakePullServer(); // the fake sets no content-length header

		const result = await pullCustomBatch({
			baseUrl: BASE_URL,
			checkpoint: null,
			limit: 50,
			fetcher: server.fetch,
		});

		expect(result.responseBytes).toBe(
			new TextEncoder().encode(server.responseBodies[0]).byteLength
		);
	});
});

describe('measuredResponseBytes', () => {
	it('counts UTF-8 bytes, not string length (multibyte payloads)', () => {
		expect(measuredResponseBytes('')).toBe(0);
		expect(measuredResponseBytes('abc')).toBe(3);
		// 'é' is 2 bytes, '€' is 3, '😀' is 4 (one surrogate pair, length 2).
		expect(measuredResponseBytes('é€😀')).toBe(9);
	});
});

describe('syncCustomPullIntoRepository', () => {
	it('pulls custom batches from wcpos and upserts each batch into the repository', async () => {
		const server = createFakePullServer();
		server.seed({ uuid: fakeUuid(1), wooOrderId: 1 });
		server.seed({ uuid: fakeUuid(2), wooOrderId: 2 });
		const fetcher = vi.fn(server.fetch);
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const onBatch = vi.fn();

		const result = await syncCustomPullIntoRepository({
			baseUrl: BASE_URL,
			limit: 1,
			repository,
			fetcher,
			onBatch,
		});

		// limit 1 over a 2-row journal: two pages, each upserted as its own batch.
		expect(
			repository.upsertMany.mock.calls.map(([documents]) =>
				documents.map((document) => document.wooOrderId)
			)
		).toEqual([[1], [2]]);
		expect(onBatch).toHaveBeenNthCalledWith(1, { batch: 1, documentCount: 1, totalDocuments: 1 });
		expect(onBatch).toHaveBeenNthCalledWith(2, { batch: 2, documentCount: 1, totalDocuments: 2 });
		expect(result).toEqual({ batches: 2, documents: 2 });
	});

	it('forwards includeDeletes + the delete freshness hook to each batch (CodeRabbit Major)', async () => {
		const server = createFakePullServer();
		server.seed({ uuid: fakeUuid(999), wooOrderId: 999 });
		server.remove(999); // net state: deleted — the page coalesces to the tombstone
		const fetcher = vi.fn(server.fetch);
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
			removeDeletedOrders: vi.fn(async () => undefined),
		};
		const fresh = new Set<string | number>([999]);
		const refreshPendingMutationOrderIds = vi.fn(async () => fresh);

		await syncCustomPullIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher,
			includeDeletes: true,
			pendingMutationOrderIds: new Set<string | number>(),
			refreshPendingMutationOrderIds,
		});

		// The wrapper enables deletes AND forwards the freshness hook, so the multi-batch API's
		// delete guard sees the fresh set — not the stale pre-pull snapshot.
		expect(fetcher.mock.calls[0][0]).toContain('include_deletes=true');
		expect(refreshPendingMutationOrderIds).toHaveBeenCalled();
		expect(repository.removeDeletedOrders).toHaveBeenCalledWith([999], fresh);
	});

	it('deduplicates duplicate order IDs within one custom pull batch before bulk upsert', async () => {
		// Deliberately OFF-contract inline fixture: the PHP coalesces each order to one row per page
		// (class-rest-controller.php:139-148), so a real server never emits duplicate ids — this pins
		// the client's defense in depth against a misbehaving/legacy server.
		const olderDocument = {
			id: 'woo-order:114',
			wooOrderId: 114,
			payload: { id: 114, status: 'processing' },
			sync: { partial: false, checkpoint: { sequence: 1 } },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const newerDocument = {
			...olderDocument,
			payload: { id: 114, status: 'completed' },
			sync: { partial: false, checkpoint: { sequence: 2 } },
		};
		const fetcher = vi.fn().mockResolvedValue(
			response({
				documents: [olderDocument, newerDocument],
				checkpoint: {
					updatedAtGmt: '2026-05-20T10:05:00.000Z',
					orderId: 114,
					revision: 'new',
					sequence: 2,
				},
				hasMore: false,
			})
		);
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const onBatch = vi.fn();

		const result = await syncCustomPullIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher,
			onBatch,
		});

		expect(repository.upsertMany).toHaveBeenCalledWith([newerDocument]);
		expect(onBatch).toHaveBeenCalledWith({ batch: 1, documentCount: 1, totalDocuments: 1 });
		expect(result).toEqual({ batches: 1, documents: 1 });
	});

	it('resumes from the persisted checkpoint and stores the next checkpoint after a successful batch', async () => {
		const persistedCheckpoint = {
			updatedAtGmt: '2026-05-20T10:00:00.000Z',
			orderId: 10,
			revision: 'old',
			sequence: 10,
		};
		const server = createFakePullServer();
		server.seed({
			uuid: fakeUuid(11),
			wooOrderId: 11,
			sequence: 11,
			modifiedGmt: '2026-05-20 10:05:00',
			revision: 'new',
		});
		const fetcher = vi.fn(server.fetch);
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => persistedCheckpoint),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};

		await syncCustomPullIntoRepository({
			baseUrl: BASE_URL,
			limit: 1,
			repository,
			fetcher,
			checkpointStore,
		});

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/orders/pull?limit=1&updated_at_gmt=2026-05-20T10%3A00%3A00.000Z&order_id=10&sequence=10'
		);
		expect(
			repository.upsertMany.mock.calls.map(([documents]) =>
				documents.map((document) => document.id)
			)
		).toEqual([[fakeUuid(11)]]);
		expect(checkpointStore.writeCustomPullCheckpoint).toHaveBeenCalledWith({
			updatedAtGmt: '2026-05-20 10:05:00',
			orderId: 11,
			revision: 'new',
			sequence: 11,
		});
	});

	it('does not store the returned checkpoint when the local upsert fails', async () => {
		const server = createFakePullServer();
		server.seed({ uuid: fakeUuid(11), wooOrderId: 11 });
		const repository = {
			upsertMany: vi.fn(async () => {
				throw new Error('quota exceeded');
			}),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => normalizeCheckpoint(null)),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};

		await expect(
			syncCustomPullIntoRepository({
				baseUrl: BASE_URL,
				limit: 1,
				repository,
				fetcher: server.fetch,
				checkpointStore,
			})
		).rejects.toThrow('quota exceeded');

		expect(checkpointStore.writeCustomPullCheckpoint).not.toHaveBeenCalled();
	});

	it('aborts when paginated custom pull responses stop advancing the checkpoint', async () => {
		const server = createFakePullServer();
		server.script(() => ({ kind: 'stall' })); // cursor echoed, hasMore stays true — never advances
		const fetcher = vi.fn(server.fetch);
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const onBatch = vi.fn();

		await expect(
			syncCustomPullIntoRepository({
				baseUrl: BASE_URL,
				limit: 1,
				repository,
				fetcher,
				onBatch,
			})
		).rejects.toThrow('Custom pull stalled: checkpoint did not advance while hasMore=true');

		expect(fetcher).toHaveBeenCalledTimes(3);
		expect(repository.upsertMany).toHaveBeenCalledTimes(3);
		expect(onBatch).toHaveBeenCalledTimes(3);
	});

	it('treats one GMT instant in mixed timezone forms as a stall, not endless progress', async () => {
		// Regression (1.9.x bug fa7b51add): Woo serves the same `date_modified_gmt`
		// instant in inconsistent forms — bare, `Z`, `+00:00`, the MySQL space form.
		// A raw string compare of the checkpoint's updatedAtGmt would read every
		// format flip as forward progress, so the stall guard would never fire and
		// this loop would spin forever. orderId/revision/sequence never move here, so
		// an instant-aware compare must recognise a stall and abort after 3 batches.
		const sameInstantForms = [
			'2026-05-20T10:05:00Z',
			'2026-05-20T10:05:00',
			'2026-05-20T10:05:00+00:00',
			'2026-05-20 10:05:00',
			'2026-05-20T10:05:00.000Z',
		];
		const server = createFakePullServer();
		let page = 0;
		server.script(() => ({
			kind: 'stall',
			checkpoint: {
				updatedAtGmt: sameInstantForms[page++],
				orderId: 114,
				revision: 'rev',
				sequence: 5,
			},
		}));
		const fetcher = vi.fn(server.fetch);
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};

		await expect(
			syncCustomPullIntoRepository({
				baseUrl: BASE_URL,
				limit: 1,
				repository,
				fetcher,
			})
		).rejects.toThrow('Custom pull stalled: checkpoint did not advance while hasMore=true');

		// Page 1 legitimately advances the initial zero checkpoint; the format flips
		// on pages 2–4 are the stall (3 non-advancing batches → throw on batch 4).
		// Without instant-aware comparison every flip reads as progress, the guard
		// never fires, and the loop drains all 5 scripted pages then errors elsewhere.
		expect(fetcher).toHaveBeenCalledTimes(4);
	});

	it('skips pulled documents with pending local mutations while applying the rest', async () => {
		const server = createFakePullServer();
		server.seed({ uuid: fakeUuid(7), wooOrderId: 7, payload: { status: 'completed' } });
		server.seed({ uuid: fakeUuid(8), wooOrderId: 8 });
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};

		const result = await syncCustomPullIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			pendingMutationOrderIds: new Set<string | number>([fakeUuid(7)]),
		});

		expect(
			repository.upsertMany.mock.calls.map(([documents]) =>
				documents.map((document) => document.id)
			)
		).toEqual([[fakeUuid(8)]]);
		expect(result).toEqual({ batches: 1, documents: 1 });
	});

	it('normalizes partial custom pull checkpoints before detecting advancement', async () => {
		const server = createFakePullServer();
		server.script(() => ({
			kind: 'stall',
			checkpoint: { updatedAtGmt: null, orderId: null, revision: null, sequence: null },
		}));
		const fetcher = vi.fn(server.fetch);
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};

		await expect(
			syncCustomPullIntoRepository({
				baseUrl: BASE_URL,
				limit: 1,
				repository,
				fetcher,
			})
		).rejects.toThrow('Custom pull stalled: checkpoint did not advance while hasMore=true');

		expect(fetcher).toHaveBeenCalledTimes(3);
	});
});

describe('syncCustomPullBatchIntoRepository journal epoch (F8)', () => {
	function epochStore(
		storedEpoch: string | undefined,
		storedCheckpoint = normalizeCheckpoint({
			updatedAtGmt: '2026-05-19T00:00:00.000Z',
			orderId: 12,
			revision: 'r',
			sequence: 5000,
		})
	) {
		return {
			readCustomPullCheckpoint: vi.fn(async () => storedCheckpoint),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
			readJournalEpoch: vi.fn(async () => storedEpoch),
			writeJournalEpoch: vi.fn(async () => undefined),
		};
	}

	it('resyncs from zero when the stored epoch differs from the server epoch', async () => {
		const server = createFakePullServer({ epoch: 'epoch-NEW' });
		server.seed({ uuid: fakeUuid(1), wooOrderId: 1 });
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const store = epochStore('epoch-OLD', normalizeCheckpoint(null));

		const result = await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			checkpointStore: store,
		});

		expect(repository.upsertMany).not.toHaveBeenCalled(); // the stale-cursor batch is discarded, not applied
		expect(store.writeCustomPullCheckpoint).toHaveBeenCalledWith(normalizeCheckpoint(null)); // reset to zero
		expect(store.writeJournalEpoch).toHaveBeenCalledWith('epoch-NEW'); // adopt the new generation
		expect(result).toEqual({ documents: 0, hasMore: true, checkpoint: normalizeCheckpoint(null) });
	});

	it('reconciles the local collection on reset, using a fresh pending read (Codex P1)', async () => {
		const server = createFakePullServer({ epoch: 'epoch-NEW' });
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
			resetForResync: vi.fn(async () => undefined),
		};
		const store = epochStore('epoch-OLD', normalizeCheckpoint(null));
		const fresh = new Set<string | number>([777]);
		const refreshPendingMutationOrderIds = vi.fn(async () => fresh);

		await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			checkpointStore: store,
			refreshPendingMutationOrderIds,
		});

		// Phantom orders (absent from the new generation) are cleared before the re-pull; the FRESH
		// pending set keeps a mutation queued mid-pull.
		expect(refreshPendingMutationOrderIds).toHaveBeenCalled();
		expect(repository.resetForResync).toHaveBeenCalledWith(fresh);
	});

	it('resyncs from zero when the checkpoint sequence exceeds the server head', async () => {
		// Same epoch, but the head reset beneath the cursor (restore/truncate): stored seq 5000, head 200.
		const server = createFakePullServer({ epoch: 'epoch-A' });
		server.seed({ uuid: fakeUuid(1), wooOrderId: 1, sequence: 200 }); // journal head = 200
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const store = epochStore('epoch-A'); // stored checkpoint sequence 5000

		const result = await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			checkpointStore: store,
		});

		expect(store.writeCustomPullCheckpoint).toHaveBeenCalledWith(normalizeCheckpoint(null));
		expect(result.hasMore).toBe(true);
		expect(result.checkpoint).toEqual(normalizeCheckpoint(null));
	});

	it('advances normally when the epoch matches and the cursor is within the head', async () => {
		const server = createFakePullServer({ epoch: 'epoch-A' });
		server.seed({
			uuid: fakeUuid(1),
			wooOrderId: 1,
			sequence: 5001,
			modifiedGmt: '2026-05-20 10:05:00',
			revision: 'r',
		});
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const store = epochStore('epoch-A'); // stored checkpoint sequence 5000 ≤ head 5001

		const result = await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			checkpointStore: store,
		});

		const next = { updatedAtGmt: '2026-05-20 10:05:00', orderId: 1, revision: 'r', sequence: 5001 };
		expect(
			repository.upsertMany.mock.calls.map(([documents]) =>
				documents.map((document) => document.id)
			)
		).toEqual([[fakeUuid(1)]]); // applied — no reset
		expect(store.writeCustomPullCheckpoint).toHaveBeenCalledWith(next);
		expect(store.writeJournalEpoch).toHaveBeenCalledWith('epoch-A'); // idempotent re-adopt
		expect(result.checkpoint).toEqual(next);
	});

	it('adopts the epoch on a first pull (no stored epoch) without resyncing', async () => {
		const server = createFakePullServer({ epoch: 'epoch-FIRST' });
		server.seed({ uuid: fakeUuid(1), wooOrderId: 1 });
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const store = epochStore(undefined, normalizeCheckpoint(null)); // fresh client: no epoch, zero checkpoint

		const result = await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			checkpointStore: store,
		});

		expect(
			repository.upsertMany.mock.calls.map(([documents]) =>
				documents.map((document) => document.id)
			)
		).toEqual([[fakeUuid(1)]]);
		expect(store.writeJournalEpoch).toHaveBeenCalledWith('epoch-FIRST');
		expect(result.documents).toBe(1);
	});
});

describe('hostile-envelope poison guards (B7, ADR 0017 family)', () => {
	// These envelopes are IMPOSSIBLE for a contract-faithful server (head is the journal
	// MAX(sequence); the response checkpoint starts at the request cursor and only advances), so the
	// fakePullServer deliberately cannot emit them — they are hand-rolled here, the same pattern as
	// the off-contract duplicate-id fixture above.
	function hostileFetcher(envelope: Record<string, unknown>) {
		return vi.fn(async () => response(envelope));
	}

	function trackingStore(initialSequence: number, epoch = 'epoch-A') {
		let stored = normalizeCheckpoint({
			updatedAtGmt: '2026-05-19T00:00:00.000Z',
			orderId: 1,
			revision: 'r',
			sequence: initialSequence,
		});
		return {
			readCustomPullCheckpoint: vi.fn(async () => stored),
			writeCustomPullCheckpoint: vi.fn(async (next: ReturnType<typeof normalizeCheckpoint>) => {
				stored = next;
			}),
			readJournalEpoch: vi.fn(async () => epoch),
			writeJournalEpoch: vi.fn(async () => undefined),
		};
	}

	it('rejects a response whose checkpoint sequence exceeds its own head, without applying or advancing', async () => {
		// Same epoch, request cursor (0) within head — NOT a resync case. The server claims it served
		// rows past its own journal head: impossible, so the batch must die unapplied.
		const fetcher = hostileFetcher({
			documents: [
				{
					id: fakeUuid(1),
					wooOrderId: 1,
					payload: { id: 1 },
					sync: { partial: false, checkpoint: { sequence: 5 } },
					local: { dirty: false, pendingMutationIds: [] },
				},
			],
			checkpoint: {
				updatedAtGmt: '2026-05-20T00:00:00.000Z',
				orderId: 1,
				revision: 'r5',
				sequence: 5,
			},
			hasMore: true,
			epoch: 'epoch-A',
			head: 2,
		});
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const store = trackingStore(0);

		await expect(
			syncCustomPullBatchIntoRepository({
				baseUrl: BASE_URL,
				limit: 50,
				repository,
				fetcher,
				checkpointStore: store,
			})
		).rejects.toThrow(
			new CustomPullPoisonError(
				'Custom pull poisoned: response checkpoint sequence 5 exceeds the reported journal head 2'
			)
		);

		expect(repository.upsertMany).not.toHaveBeenCalled();
		expect(store.writeCustomPullCheckpoint).not.toHaveBeenCalled();
	});

	it('aborts the B5 resync↔advance ping-pong instead of looping forever (OOM regression)', async () => {
		// The B5 finding: a hostile `head < checkpoint.sequence` + `hasMore: true` envelope. Before the
		// guard: batch 1 (cursor 5 > head 2) resyncs to zero, batch 2 (cursor 0) "advances" back onto
		// sequence 5, batch 3 resyncs again … each flip resets the stall counter, so the loop never
		// terminated. Now the resync leg stays intact (it IS the F8 design) and the advance leg is
		// where the impossibility shows — poison on the second fetch.
		const fetcher = hostileFetcher({
			documents: [],
			checkpoint: {
				updatedAtGmt: '2026-05-20T00:00:00.000Z',
				orderId: 1,
				revision: 'r5',
				sequence: 5,
			},
			hasMore: true,
			epoch: 'epoch-A',
			head: 2,
		});
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const store = trackingStore(5);

		await expect(
			syncCustomPullIntoRepository({
				baseUrl: BASE_URL,
				limit: 50,
				repository,
				fetcher,
				checkpointStore: store,
			})
		).rejects.toThrow(CustomPullPoisonError);

		// Fetch 1: legitimate cursorPastHead resync (5 > 2) → cursor reset to zero.
		// Fetch 2: the hostile "advance" onto sequence 5 past head 2 → poison, loop dead.
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(store.writeCustomPullCheckpoint).toHaveBeenCalledTimes(1); // only the resync's zero write
		expect(store.writeCustomPullCheckpoint).toHaveBeenCalledWith(normalizeCheckpoint(null));
	});

	it('rejects a checkpoint that regresses below the request cursor within the same generation', async () => {
		// Same epoch, head (12) at or above the cursor (10) — no resync trigger. A checkpoint moving
		// BACKWARDS reads as "advanced" to the stall guard's inequality compare and would re-serve
		// already-applied rows; within one generation the contract makes it impossible.
		const fetcher = hostileFetcher({
			documents: [],
			checkpoint: {
				updatedAtGmt: '2026-05-18T00:00:00.000Z',
				orderId: 3,
				revision: 'r3',
				sequence: 3,
			},
			hasMore: true,
			epoch: 'epoch-A',
			head: 12,
		});
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const store = trackingStore(10);

		await expect(
			syncCustomPullBatchIntoRepository({
				baseUrl: BASE_URL,
				limit: 50,
				repository,
				fetcher,
				checkpointStore: store,
			})
		).rejects.toThrow(
			new CustomPullPoisonError(
				'Custom pull poisoned: response checkpoint sequence 3 regressed below the request cursor sequence 10'
			)
		);

		expect(repository.upsertMany).not.toHaveBeenCalled();
		expect(store.writeCustomPullCheckpoint).not.toHaveBeenCalled();
	});

	it('catches a regression even when the server reports no head or epoch', async () => {
		// A server without F8 support can still only serve `sequence > cursor` — an empty page echoes
		// the request cursor, never a lower one — so the regression guard needs neither sibling field.
		const fetcher = hostileFetcher({
			documents: [],
			checkpoint: {
				updatedAtGmt: '2026-05-18T00:00:00.000Z',
				orderId: 3,
				revision: 'r3',
				sequence: 3,
			},
			hasMore: false,
		});
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};

		await expect(
			syncCustomPullBatchIntoRepository({
				baseUrl: BASE_URL,
				limit: 50,
				repository,
				fetcher,
				checkpoint: {
					updatedAtGmt: '2026-05-19T00:00:00.000Z',
					orderId: 1,
					revision: 'r',
					sequence: 10,
				},
			})
		).rejects.toThrow(CustomPullPoisonError);

		expect(repository.upsertMany).not.toHaveBeenCalled();
	});

	it('allows a no-F8 fallback page that reports sequence zero below a nonzero cursor', async () => {
		// The legacy PHP fallback scan stamps fallback rows/checkpoints with sequence 0. A no-F8 server
		// can therefore report an empty fallback page with hasMore=true below the request cursor without
		// poisoning the pull.
		const fetcher = hostileFetcher({
			documents: [],
			checkpoint: {
				updatedAtGmt: '1970-01-01T00:00:00.000Z',
				orderId: 0,
				revision: '',
				sequence: 0,
			},
			hasMore: true,
		});
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const store = trackingStore(10);

		const result = await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher,
			checkpointStore: store,
		});

		expect(result).toEqual({ documents: 0, hasMore: true, checkpoint: normalizeCheckpoint(null) });
		expect(repository.upsertMany).toHaveBeenCalledWith([]);
		expect(store.writeCustomPullCheckpoint).toHaveBeenCalledWith(normalizeCheckpoint(null));
	});
});

describe('shouldApplyPulledDocument', () => {
	const pending = new Set<string | number>(['local-order:sat-rush-r1-1', 'woo-order:204', 207]);

	it('blocks pulled documents whose document id has a pending mutation', () => {
		expect(shouldApplyPulledDocument({ id: 'woo-order:204', wooOrderId: 204 }, pending)).toBe(
			false
		);
	});

	it('blocks pulled documents whose temp id has a pending mutation', () => {
		expect(
			shouldApplyPulledDocument({ id: 'local-order:sat-rush-r1-1', wooOrderId: null }, pending)
		).toBe(false);
	});

	it('blocks pulled documents whose woo order id has a pending mutation', () => {
		expect(shouldApplyPulledDocument({ id: 'woo-order:207', wooOrderId: 207 }, pending)).toBe(
			false
		);
	});

	it('applies pulled documents with no pending mutations', () => {
		expect(shouldApplyPulledDocument({ id: 'woo-order:999', wooOrderId: 999 }, pending)).toBe(true);
		expect(shouldApplyPulledDocument({ id: 'woo-order:999', wooOrderId: null }, pending)).toBe(
			true
		);
		expect(shouldApplyPulledDocument({ id: 'woo-order:1', wooOrderId: 1 }, new Set())).toBe(true);
	});
});

describe('syncCustomPullBatchIntoRepository pull guard wiring', () => {
	function seededServer() {
		const server = createFakePullServer();
		server.seed({
			uuid: fakeUuid(11),
			wooOrderId: 11,
			payload: { status: 'completed' },
			sequence: 11,
			modifiedGmt: '2026-06-10 10:00:00',
			revision: 'rev-11',
		});
		server.seed({
			uuid: fakeUuid(12),
			wooOrderId: 12,
			sequence: 12,
			modifiedGmt: '2026-06-10 10:05:00',
			revision: 'rev-12',
		});
		return server;
	}
	const advancedCheckpoint = {
		updatedAtGmt: '2026-06-10 10:05:00',
		orderId: 12,
		revision: 'rev-12',
		sequence: 12,
	};

	it('filters pending documents out of the upsert but still advances the checkpoint', async () => {
		const server = seededServer();
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => normalizeCheckpoint(null)),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};

		const result = await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			checkpointStore,
			pendingMutationOrderIds: new Set<string | number>([11]),
		});

		expect(
			repository.upsertMany.mock.calls.map(([documents]) =>
				documents.map((document) => document.id)
			)
		).toEqual([[fakeUuid(12)]]);
		expect(checkpointStore.writeCustomPullCheckpoint).toHaveBeenCalledWith(advancedCheckpoint);
		expect(result).toEqual({ documents: 1, hasMore: false, checkpoint: advancedCheckpoint });
	});

	it('applies every document when no pending mutation set is provided', async () => {
		const server = seededServer();
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};

		const result = await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
		});

		expect(
			repository.upsertMany.mock.calls.map(([documents]) =>
				documents.map((document) => document.id)
			)
		).toEqual([[fakeUuid(11), fakeUuid(12)]]);
		expect(result.documents).toBe(2);
	});

	it('maps each pulled record through the injected assembleDocument before dedup/upsert', async () => {
		const server = createFakePullServer();
		server.seed({ uuid: fakeUuid(12), wooOrderId: 12 });
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};

		await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			// Stand-in for the order fetcher's identity assembly — the client owns the document id.
			assembleDocument: (document) => ({ ...document, id: `assembled:${document.wooOrderId}` }),
		});

		expect(
			repository.upsertMany.mock.calls.map(([documents]) =>
				documents.map((document) => document.id)
			)
		).toEqual([['assembled:12']]);
	});
});

describe('syncCustomPullBatchIntoRepository delete channel (F6)', () => {
	function serverWithDeleted(wooOrderIds: number[]) {
		const server = createFakePullServer();
		for (const wooOrderId of wooOrderIds) {
			server.seed({ uuid: fakeUuid(wooOrderId), wooOrderId });
			server.remove(wooOrderId); // net state per page: deleted (coalesced to the tombstone)
		}
		return server;
	}

	it('requests the delete channel when includeDeletes is set', async () => {
		const server = createFakePullServer();
		const fetcher = vi.fn(server.fetch);
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
			removeDeletedOrders: vi.fn(async () => undefined),
		};

		await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher,
			includeDeletes: true,
		});

		expect(fetcher.mock.calls[0][0]).toContain('include_deletes=true');
	});

	it('forwards server deletes + the pending set to the repository remove', async () => {
		const server = serverWithDeleted([999, 1000]);
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
			removeDeletedOrders: vi.fn(async () => undefined),
		};
		const pending = new Set<string | number>([11]);

		await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			includeDeletes: true,
			pendingMutationOrderIds: pending,
		});

		expect(repository.removeDeletedOrders).toHaveBeenCalledWith([999, 1000], pending);
	});

	it('re-reads the pending set right before applying deletes (freshness for the destructive guard)', async () => {
		const server = serverWithDeleted([999]);
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
			removeDeletedOrders: vi.fn(async () => undefined),
		};
		const stale = new Set<string | number>();
		const fresh = new Set<string | number>([999]); // a mutation queued mid-pull
		const refreshPendingMutationOrderIds = vi.fn(async () => fresh);

		await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			includeDeletes: true,
			pendingMutationOrderIds: stale,
			refreshPendingMutationOrderIds,
		});

		expect(refreshPendingMutationOrderIds).toHaveBeenCalledOnce();
		// The delete guard uses the FRESH set (999 now protected), not the pre-pull snapshot.
		expect(repository.removeDeletedOrders).toHaveBeenCalledWith([999], fresh);
	});

	it('guards the UPSERT with the fresh pending set too, not just deletes/reset (Codex P1)', async () => {
		// A mutation queued mid-pull (in the fresh set, absent from the pre-pull snapshot) must protect
		// its order from being re-upserted over — the forced re-pull from zero would otherwise clobber it.
		const server = createFakePullServer();
		server.seed({ uuid: fakeUuid(777), wooOrderId: 777 });
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const refreshPendingMutationOrderIds = vi.fn(async () => new Set<string | number>([777]));

		await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			pendingMutationOrderIds: new Set<string | number>(), // stale snapshot: empty
			refreshPendingMutationOrderIds,
		});

		expect(repository.upsertMany).toHaveBeenCalledWith([]); // 777 skipped by the fresh set
	});

	it('falls back to the pre-pull pending set for deletes when no refresh provider is given', async () => {
		const server = serverWithDeleted([999]);
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
			removeDeletedOrders: vi.fn(async () => undefined),
		};
		const pending = new Set<string | number>([11]);

		await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			includeDeletes: true,
			pendingMutationOrderIds: pending,
		});

		expect(repository.removeDeletedOrders).toHaveBeenCalledWith([999], pending);
	});

	it('does not call remove when the response carries no deletes', async () => {
		const server = createFakePullServer();
		server.seed({ uuid: fakeUuid(12), wooOrderId: 12 });
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
			removeDeletedOrders: vi.fn(async () => undefined),
		};

		await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			includeDeletes: true,
		});

		expect(repository.removeDeletedOrders).not.toHaveBeenCalled();
	});

	it('no-ops gracefully when the repository cannot apply deletes', async () => {
		const server = serverWithDeleted([999]);
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		}; // no removeDeletedOrders

		const result = await syncCustomPullBatchIntoRepository({
			baseUrl: BASE_URL,
			limit: 50,
			repository,
			fetcher: server.fetch,
			includeDeletes: true,
		});

		// The checkpoint still advances past the tombstone row; the delete simply is not applied.
		expect(result.checkpoint.sequence).toBe(2);
		expect(result.checkpoint.orderId).toBe(999);
	});
});
