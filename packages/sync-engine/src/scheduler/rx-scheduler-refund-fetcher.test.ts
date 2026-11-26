import { describe, expect, it, vi } from 'vitest';

import { buildCoverageDocumentsFromQueryResult } from './query-coverage-writes';
import {
	createRefundsSchedulerFetcher,
	REFUND_HISTORY_CHECKPOINT_KEY,
	type RefundHistoryCheckpointStore,
} from './rx-scheduler-refund-fetcher';

import type { FetchTask } from './replication-policy';
import type { LocalRefundDocument } from '../collections/refund-schema';
import type { BuildCoverageDocumentsFromQueryResultInput } from './query-coverage-writes';

const row = (
	id: number,
	parent_id = 42,
	meta_data: { key: string; value: string | number }[] = []
) => ({
	id,
	parent_id,
	amount: '20.0000',
	reason: '',
	date_created_gmt: '2026-09-01T00:00:00',
	meta_data,
});
const task = (queryKey = 'refunds:history:days=92'): FetchTask => ({
	id: queryKey,
	requirementId: 'refund-test',
	collection: 'refunds',
	queryKey,
	limit: 100,
	priority: 100,
	mode: 'greedy',
});
function setup(
	pages: ReturnType<typeof row>[][],
	held = new Map<number, number[] | null>([[42, null]]),
	scope?: { storeId?: string | number }
) {
	const documents: LocalRefundDocument[] = [];
	const requests: URL[] = [];
	const coverage: BuildCoverageDocumentsFromQueryResultInput[] = [];
	let now = Date.parse('2026-09-16T00:00:00Z');
	const heldParentIds = vi.fn(async (_ids: number[]) => held);
	const removeMany = vi.fn(async (rows: LocalRefundDocument[]) => {
		const ids = rows.map(({ uuid }) => uuid);
		for (let i = documents.length - 1; i >= 0; i -= 1)
			if (ids.includes(documents[i].uuid)) documents.splice(i, 1);
	});
	const upsertMany = vi.fn(async (rows: LocalRefundDocument[]) => {
		documents.push(...rows);
	});
	const fetcher = createRefundsSchedulerFetcher({
		baseUrl: 'https://example.test/wp-json/wcpos/v2',
		scope,
		nowMs: () => now,
		heldParentIds,
		repository: {
			removeMany,
			upsertMany,
		},
		coverageRepository: {
			recordQueryResult: async (value) => {
				coverage.push(value);
			},
		},
		fetcher: async (url) => {
			requests.push(new URL(url));
			now += 86400000;
			return new Response(JSON.stringify(pages[requests.length - 1]), { status: 200 });
		},
	});
	return { fetcher, documents, requests, coverage, heldParentIds, upsertMany };
}

describe('refund paged upsert-only fetcher', () => {
	// Revert scoped admission: store 2 is written when this till belongs to store 1.
	it('admits only matching stores when scoped, and all POS stores when unscoped', async () => {
		const rows = [
			row(1, 99, [{ key: '_pos_store', value: 2 }]),
			row(2, 99, [{ key: '_pos_store', value: '1' }]),
			row(3, 99, [{ key: '_pos_user', value: '7' }]),
		];
		const scoped = setup([rows], new Map(), { storeId: ' 1 ' });
		expect(await scoped.fetcher(task())).toMatchObject({ documentCount: 2 });
		expect(scoped.upsertMany.mock.calls[0][0].map((doc) => doc.payload.id)).toEqual([2, 3]);
		expect(scoped.documents.map((doc) => doc.payload.id)).toEqual([2, 3]);
		expect(scoped.coverage.at(-1)?.records).toEqual([
			{ id: 'woo-refund:2' },
			{ id: 'woo-refund:3' },
		]);
		const unscoped = setup([rows], new Map());
		expect(await unscoped.fetcher(task())).toMatchObject({ documentCount: 3 });
		expect(unscoped.documents.map((doc) => doc.payload.id)).toEqual([1, 2, 3]);
	});

	// Revert scoped confirmation: the foreign refund survives after its held parent disappears.
	it('removes a foreign store refund after upsert when its parent disappears', async () => {
		const h = setup(
			[
				[
					row(1, 42, [{ key: '_pos_store', value: '2' }]),
					row(2, 42, [{ key: '_pos_store', value: 1 }]),
				],
			],
			new Map([[42, null]]),
			{ storeId: 1 }
		);
		h.heldParentIds.mockResolvedValueOnce(new Map([[42, null]])).mockResolvedValueOnce(new Map());
		expect(await h.fetcher(task())).toMatchObject({ documentCount: 1 });
		expect(h.documents.map((doc) => doc.payload.id)).toEqual([2]);
		expect(h.coverage.at(-1)?.records).toEqual([{ id: 'woo-refund:2' }]);
	});

	// Restore cumulative per-page recordCoverage: the first page's coverage rows are written three times.
	it('writes each refund coverage row once across three pages and completes the cumulative lane once', async () => {
		const h = setup([[row(1)], [row(2)], []]);
		const request = { ...task(), limit: 1 };
		await h.fetcher(request);
		await h.fetcher(request);
		await h.fetcher(request);
		const writes = h.coverage.map(buildCoverageDocumentsFromQueryResult);
		expect(writes.flatMap((write) => write.records.map((record) => record.documentId))).toEqual([
			'woo-refund:1',
			'woo-refund:2',
		]);
		expect(writes.flatMap((write) => write.lanes).filter((lane) => lane.complete)).toEqual([
			expect.objectContaining({ expectedRecordIds: ['woo-refund:1', 'woo-refund:2'] }),
		]);
	});

	// Remove the post-upsert parent confirmation: the stale page resurrects refund 1.
	it('removes written refunds dropped by the parent between admission and upsert', async () => {
		const h = setup([[row(1)]], new Map([[42, [1]]]));
		h.heldParentIds
			.mockResolvedValueOnce(new Map([[42, [1]]]))
			.mockResolvedValueOnce(new Map([[42, []]]));
		await h.fetcher(task());
		expect(h.documents).toEqual([]);
		expect(h.heldParentIds.mock.calls).toEqual([[[42]], [[42]]]);
		expect(h.coverage.at(-1)?.records).toEqual([]);
	});

	// Revert the absent-parent confirmation branch: the unstamped orphan remains stored and covered.
	// Revert confirmation to session/register-only stamps: the Pro-stamped sibling is removed.
	it.each(['_wcpos_session', '_wcpos_register', '_pos_user', '_pos_store'])(
		'removes unstamped refunds when the parent disappears but retains a %s sibling',
		async (stamp) => {
			const h = setup([[row(1), row(2, 42, [{ key: stamp, value: 'pos' }])]]);
			h.heldParentIds
				.mockResolvedValueOnce(new Map([[42, [1, 2]]]))
				.mockResolvedValueOnce(new Map());
			const result = await h.fetcher(task());
			expect(h.documents.map((doc) => doc.payload.id)).toEqual([2]);
			expect(result).toMatchObject({ documentCount: 1 });
			expect(h.coverage.at(-1)?.records).toEqual([{ id: 'woo-refund:2' }]);
		}
	);

	// Restore held.has(parent_id) admission: the stamped but unlisted row is resurrected.
	it('uses an explicit held-parent summary before POS stamps, but admits without array authority', async () => {
		const rows = [row(1, 42, [{ key: '_wcpos_session', value: 'B' }]), row(2)];
		const listed = setup([rows], new Map([[42, [2]]]));
		await listed.fetcher(task());
		expect(listed.documents.map((doc) => doc.payload.id)).toEqual([2]);
		const unknown = setup([rows], new Map([[42, null]]));
		await unknown.fetcher(task());
		expect(unknown.documents.map((doc) => doc.payload.id)).toEqual([1, 2]);
	});

	it('freezes the history bound across pages, materializes without UUID, and records only lane coverage', async () => {
		const h = setup([Array.from({ length: 100 }, (_, i) => row(i + 1)), [row(101)]]);
		expect(await h.fetcher(task())).toMatchObject({ completed: false, documentCount: 100 });
		expect(await h.fetcher(task())).toMatchObject({ completed: true, documentCount: 1 });
		expect(h.requests.map((u) => Object.fromEntries(u.searchParams))).toEqual([
			{
				after: '2026-06-16T00:00:00',
				dates_are_gmt: '1',
				orderby: 'id',
				order: 'asc',
				per_page: '100',
				page: '1',
			},
			{
				after: '2026-06-16T00:00:00',
				dates_are_gmt: '1',
				orderby: 'id',
				order: 'asc',
				per_page: '100',
				page: '2',
			},
		]);
		expect(h.documents.at(-1)).toMatchObject({ uuid: 'woo-refund:101', remoteId: '101' });
		expect(h.coverage.at(-1)).toMatchObject({
			collection: 'refunds',
			queryKey: 'refunds:history:days=92',
			complete: true,
		});
		expect(
			buildCoverageDocumentsFromQueryResult(h.coverage.at(-1)!).lanes[0].expectedRecordIds
		).toHaveLength(101);
	});
	// Revert either provenance check to session/register-only: the absent-parent Pro refund is lost.
	it.each(['_pos_user', '_pos_store'])(
		'admits a %s-only refund without a held parent',
		async (key) => {
			const h = setup([[row(1, 99, [{ key, value: 'pos' }])]]);
			expect(await h.fetcher(task())).toMatchObject({ documentCount: 1 });
			expect(h.documents.map((doc) => doc.payload.id)).toEqual([1]);
			expect(h.coverage.at(-1)?.records).toEqual([{ id: 'woo-refund:1' }]);
		}
	);

	it('admits held parents or POS metadata but not a UUID alone', async () => {
		const h = setup([
			[
				row(1),
				row(2, 99, [{ key: '_wcpos_session', value: 'session' }]),
				row(3, 99, [{ key: '_wcpos_register', value: 'register' }]),
				row(4, 99, [{ key: '_woocommerce_pos_uuid', value: 'uuid' }]),
			],
		]);
		await h.fetcher(task());
		expect(h.documents.map((d) => d.payload.id)).toEqual([1, 2, 3]);
		expect(h.coverage.at(-1)?.records).toEqual([
			{ id: 'woo-refund:1' },
			{ id: 'woo-refund:2' },
			{ id: 'woo-refund:3' },
		]);
	});
	it('does not exhaust on a full all-rejected page and sends parent without after', async () => {
		const h = setup([Array.from({ length: 100 }, (_, i) => row(i + 1, 99)), [row(101)]]);
		const parentTask = task('refunds:parent:42');
		expect(await h.fetcher(parentTask)).toMatchObject({ completed: false, documentCount: 0 });
		expect(await h.fetcher(parentTask)).toMatchObject({ completed: true, documentCount: 1 });
		expect(
			h.requests.map((u) => [
				u.searchParams.get('parent'),
				u.searchParams.has('after'),
				u.searchParams.get('page'),
			])
		).toEqual([
			['42', false, '1'],
			['42', false, '2'],
		]);
	});
});

describe('refund history checkpoint (#3340)', () => {
	const T0 = Date.parse('2026-09-16T00:00:00Z');
	const MIN = 60_000;
	const KEY = REFUND_HISTORY_CHECKPOINT_KEY;
	const stamped = (id: number, date_created_gmt = '2026-08-01T00:00:00', amount = '20.0000') => ({
		...row(id, 42, [{ key: '_wcpos_session', value: 'B' }]),
		date_created_gmt,
		amount,
	});
	const baseRows = () => Array.from({ length: 250 }, (_, i) => stamped(i + 1));
	function checkpointSetup(
		serverRows: ReturnType<typeof row>[],
		store = new Map<string, string>()
	) {
		const state = { now: T0, failNext: false };
		const requests: URL[] = [];
		const local = new Map<number, LocalRefundDocument>();
		const coverage: BuildCoverageDocumentsFromQueryResultInput[] = [];
		const port = {
			get: vi.fn(async () => store.get(KEY) ?? null),
			set: vi.fn(async (value: string) => {
				store.set(KEY, value);
			}),
			remove: vi.fn(async () => {
				store.delete(KEY);
			}),
		};
		const build = (historyCheckpoint: RefundHistoryCheckpointStore | null = port) =>
			createRefundsSchedulerFetcher({
				baseUrl: 'https://example.test/wp-json/wcpos/v2',
				nowMs: () => state.now,
				heldParentIds: async () => new Map([[42, null]]),
				repository: {
					removeMany: async (docs: LocalRefundDocument[]) => {
						for (const doc of docs) local.delete(doc.payload.id);
					},
					upsertMany: async (docs: LocalRefundDocument[]) => {
						for (const doc of docs) local.set(doc.payload.id, doc);
					},
				},
				...(historyCheckpoint ? { historyCheckpoint } : {}),
				coverageRepository: {
					recordQueryResult: async (value) => {
						coverage.push(value);
					},
				},
				fetcher: async (url, init) => {
					const parsed = new URL(url);
					requests.push(parsed);
					if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
					if (state.failNext) {
						state.failNext = false;
						return new Response('failure', { status: 500 });
					}
					const after = parsed.searchParams.get('after');
					const parent = parsed.searchParams.get('parent');
					const perPage = Number(parsed.searchParams.get('per_page'));
					const page = Number(parsed.searchParams.get('page'));
					const matched = serverRows
						.filter((r) => after === null || r.date_created_gmt > after)
						.filter((r) => parent === null || String(r.parent_id) === parent)
						.sort((a, b) => a.id - b.id);
					return new Response(JSON.stringify(matched.slice((page - 1) * perPage, page * perPage)), {
						headers: {
							'X-WP-TotalPages': String(Math.max(1, Math.ceil(matched.length / perPage))),
						},
					});
				},
			});
		const fetcher = build();
		const walkAll = async (request = task(), using = fetcher) => {
			const start = requests.length;
			for (let i = 0; i < 20 && !(await using(request)).completed; i += 1);
			return requests.slice(start);
		};
		const blob = () => (store.has(KEY) ? JSON.parse(store.get(KEY)!) : undefined);
		const afters = (urls: URL[]) => urls.map((u) => u.searchParams.get('after'));
		return { state, requests, local, port, store, build, fetcher, walkAll, blob, afters, coverage };
	}

	// Revert the completion set: no checkpoint is written.
	it('F1: the first walk is full and writes the checkpoint', async () => {
		const h = checkpointSetup(baseRows());
		const requests = await h.walkAll();
		expect(h.afters(requests)).toEqual(Array(3).fill('2026-06-16T00:00:00'));
		expect(h.blob()).toEqual({ v: 1, lastWalkStartedAtMs: T0, lastFullWalkStartedAtMs: T0 });
		expect(h.local.size).toBe(250);
	});

	// Revert to after = now − 92 d unconditionally: the tick walks 3 pages.
	it('F2: the 30-min tick is one delta GET and keeps every earlier refund', async () => {
		const rows = baseRows();
		const h = checkpointSetup(rows);
		await h.walkAll();
		h.state.now += 31 * MIN;
		rows.push(stamped(251, '2026-09-16T00:10:00'));
		const requests = await h.walkAll();
		expect(h.afters(requests)).toEqual(['2026-09-15T00:00:00']);
		expect(h.local.has(251)).toBe(true);
		expect(h.blob()).toEqual({
			v: 1,
			lastWalkStartedAtMs: T0 + 31 * MIN,
			lastFullWalkStartedAtMs: T0,
		});
		// Money check (desk, 25 Nov): the delta neither evicts nor alters an earlier refund.
		expect([...h.local.keys()].filter((id) => id <= 250)).toHaveLength(250);
		expect(h.local.get(17)?.payload.amount).toBe('20.0000');
	});

	// Revert the overlap to 0 (after = lastWalkStartedAtMs): refund 252 stays 5.0000.
	it('F3: the delta re-fetches an edit to a refund created within the overlap', async () => {
		const rows = [...baseRows(), stamped(252, '2026-09-15T22:00:00', '5.0000')];
		const h = checkpointSetup(rows);
		await h.walkAll();
		expect(h.local.get(252)?.payload.amount).toBe('5.0000');
		rows[rows.length - 1].amount = '7.0000';
		h.state.now += 31 * MIN;
		expect(await h.walkAll()).toHaveLength(1);
		expect(h.local.get(252)?.payload.amount).toBe('7.0000');
	});

	// Revert the 24 h full-walk check: the second walk stays delta and refund 10 keeps its old amount.
	it('F4: an edit to a refund older than 24 h waits for the daily full walk', async () => {
		const rows = baseRows();
		const h = checkpointSetup(rows);
		await h.walkAll();
		rows[9].amount = '3.0000';
		h.state.now += 31 * MIN;
		expect(await h.walkAll()).toHaveLength(1);
		expect(h.local.get(10)?.payload.amount).toBe('20.0000');
		h.state.now = T0 + 24 * 60 * MIN + MIN;
		const full = await h.walkAll();
		expect(h.afters(full)).toEqual(Array(3).fill('2026-06-17T00:01:00'));
		expect(h.local.get(10)?.payload.amount).toBe('3.0000');
		expect(h.blob()).toMatchObject({ lastFullWalkStartedAtMs: T0 + 24 * 60 * MIN + MIN });
	});

	// Revert to a closure-held checkpoint instead of the port: fetcher B walks 3 pages.
	it('F5: a fresh fetcher on the same store resumes delta (restart)', async () => {
		const h = checkpointSetup(baseRows());
		await h.walkAll();
		const restarted = h.build();
		h.state.now += 31 * MIN;
		const requests = await h.walkAll(task(), restarted);
		expect(h.afters(requests)).toEqual(['2026-09-15T00:00:00']);
	});

	// Revert the remove on failure: the blob survives the failed page.
	// Revert the !walk.failed guard: the failed walk writes the checkpoint on its retry.
	it('F7: a failed walk removes the checkpoint and the next walk is full', async () => {
		const rows = baseRows();
		const h = checkpointSetup(rows);
		await h.walkAll();
		rows.push(...Array.from({ length: 150 }, (_, i) => stamped(251 + i, '2026-09-16T00:05:00')));
		h.state.now += 31 * MIN;
		expect(await h.fetcher(task())).toMatchObject({ completed: false });
		h.state.failNext = true;
		await expect(h.fetcher(task())).rejects.toThrow('500');
		expect(h.port.remove).toHaveBeenCalled();
		expect(h.store.has(KEY)).toBe(false);
		expect(await h.fetcher(task())).toMatchObject({ completed: true });
		expect(h.requests.at(-1)?.searchParams.get('page')).toBe('2');
		expect(h.store.has(KEY)).toBe(false);
		h.state.now += MIN;
		const next = await h.walkAll();
		expect(h.afters(next)).toEqual(Array(4).fill('2026-06-16T00:32:00'));
	});

	// Revert the decode to JSON.parse without field checks: the future and v:2 blobs walk delta.
	// Revert the lastFull <= lastWalk clause: the last row walks delta.
	it.each([
		'not json',
		'{"v":1,"lastWalkStartedAtMs":"x","lastFullWalkStartedAtMs":0}',
		JSON.stringify({
			v: 1,
			lastWalkStartedAtMs: T0 + 60 * MIN,
			lastFullWalkStartedAtMs: T0 + 60 * MIN,
		}),
		JSON.stringify({
			v: 2,
			lastWalkStartedAtMs: T0 - 60 * MIN,
			lastFullWalkStartedAtMs: T0 - 60 * MIN,
		}),
		JSON.stringify({
			v: 1,
			lastWalkStartedAtMs: T0 - 60 * MIN,
			lastFullWalkStartedAtMs: T0 - 30 * MIN,
		}),
	])('F8: an unreadable checkpoint %s walks full', async (stored) => {
		const h = checkpointSetup(baseRows(), new Map([[KEY, stored]]));
		const requests = await h.walkAll();
		expect(h.afters(requests)).toEqual(Array(3).fill('2026-06-16T00:00:00'));
		expect(h.blob()).toEqual({ v: 1, lastWalkStartedAtMs: T0, lastFullWalkStartedAtMs: T0 });
	});

	// Revert the lane guard (walk choice for every lane): the parent walk reads the checkpoint.
	it('F9: the parent lane never touches the checkpoint', async () => {
		const stored = JSON.stringify({ v: 1, lastWalkStartedAtMs: T0, lastFullWalkStartedAtMs: T0 });
		const h = checkpointSetup(baseRows(), new Map([[KEY, stored]]));
		h.state.now += 31 * MIN;
		const requests = await h.walkAll(task('refunds:parent:42'));
		expect(requests[0].searchParams.get('parent')).toBe('42');
		expect(requests.some((u) => u.searchParams.has('after'))).toBe(false);
		expect(h.port.get).not.toHaveBeenCalled();
		expect(h.port.set).not.toHaveBeenCalled();
		expect(h.port.remove).not.toHaveBeenCalled();
	});

	// Revert to an in-memory port when absent: the second walk is one delta GET.
	it('F10: without the checkpoint port every history walk is full', async () => {
		const h = checkpointSetup(baseRows());
		const fetcher = h.build(null);
		expect(h.afters(await h.walkAll(task(), fetcher))).toEqual(
			Array(3).fill('2026-06-16T00:00:00')
		);
		h.state.now += 31 * MIN;
		expect(h.afters(await h.walkAll(task(), fetcher))).toEqual(
			Array(3).fill('2026-06-16T00:31:00')
		);
		expect(h.port.get).not.toHaveBeenCalled();
	});

	it('F11: a walk interrupted after page 1 resumes on a fresh fetcher from that page', async () => {
		const h = checkpointSetup(baseRows());
		expect(await h.fetcher(task())).toMatchObject({ completed: false });
		const restarted = h.build();
		h.state.now += 31 * MIN;
		const requests = await h.walkAll(task(), restarted);
		expect(requests.map((url) => url.searchParams.get('page'))).toEqual(['1', '2', '3']);
		expect(h.afters(requests)).toEqual(Array(3).fill('2026-06-16T00:00:00'));
		expect(h.local.size).toBe(250);
		expect(h.blob()).toEqual({ v: 1, lastWalkStartedAtMs: T0, lastFullWalkStartedAtMs: T0 });
	});

	it('R1: an aborted full walk resumes from its last page and completes its coverage once', async () => {
		const h = checkpointSetup(baseRows());
		expect(await h.fetcher(task())).toMatchObject({ completed: false });
		expect(await h.fetcher(task())).toMatchObject({ completed: false });
		const controller = new AbortController();
		controller.abort();
		await expect(h.fetcher(task(), { signal: controller.signal })).rejects.toMatchObject({
			name: 'AbortError',
		});
		expect(h.requests.at(-1)?.searchParams.get('page')).toBe('3');
		expect(h.port.remove).not.toHaveBeenCalled();
		expect(h.blob()).toEqual({ v: 1, walk: expect.objectContaining({ page: 2 }) });
		h.state.now += MIN;
		const resumed = await h.walkAll(task(), h.build());
		expect(resumed.map((url) => url.searchParams.get('page'))).toEqual(['2', '3']);
		expect(h.afters(resumed)).toEqual(Array(2).fill('2026-06-16T00:00:00'));
		const complete = h.coverage.filter((value) => value.complete);
		expect(complete).toHaveLength(1);
		expect(complete[0].expectedRecordIds).toHaveLength(250);
		expect(new Set(complete[0].expectedRecordIds).size).toBe(250);
		expect(h.blob()).toEqual({ v: 1, lastWalkStartedAtMs: T0, lastFullWalkStartedAtMs: T0 });
	});

	it('R2: an aborted delta walk keeps the last completed walk for older readers', async () => {
		const rows = baseRows();
		const h = checkpointSetup(rows);
		await h.walkAll();
		rows.push(
			...Array.from({ length: 150 }, (_, index) => stamped(251 + index, '2026-09-16T00:05:00'))
		);
		h.state.now += 31 * MIN;
		expect(await h.fetcher(task())).toMatchObject({ completed: false });
		const controller = new AbortController();
		controller.abort();
		await expect(h.fetcher(task(), { signal: controller.signal })).rejects.toMatchObject({
			name: 'AbortError',
		});
		expect(h.requests.at(-1)?.searchParams.get('page')).toBe('2');
		expect(h.blob()).toMatchObject({
			v: 1,
			lastWalkStartedAtMs: T0,
			lastFullWalkStartedAtMs: T0,
			walk: { page: 1 },
		});
		h.state.now += MIN;
		const resumed = await h.walkAll(task(), h.build());
		expect(resumed.map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);
		expect(h.afters(resumed)).toEqual(Array(2).fill('2026-09-15T00:00:00'));
		expect(h.blob()).toEqual({
			v: 1,
			lastWalkStartedAtMs: T0 + 31 * MIN,
			lastFullWalkStartedAtMs: T0,
		});
	});

	it.each([
		{ startedAtMs: T0 - 25 * 60 * MIN },
		{ perPage: 50 },
		{ taskId: 'other' },
		{ ids: 'not an array' },
		{ page: 0 },
		{ startedAtMs: T0 + MIN },
	])('R3: an invalid walk record %o falls back to the completed checkpoint', async (invalid) => {
		const stored = JSON.stringify({
			v: 1,
			lastWalkStartedAtMs: T0 - 30 * MIN,
			lastFullWalkStartedAtMs: T0 - 30 * MIN,
			walk: {
				taskId: task().id,
				after: '2026-06-16T00:00:00',
				perPage: 100,
				page: 2,
				startedAtMs: T0,
				lastFullWalkStartedAtMs: T0 - 25 * 60 * MIN,
				ids: [],
				...invalid,
			},
		});
		const h = checkpointSetup(baseRows(), new Map([[KEY, stored]]));
		const requests = await h.walkAll();
		expect(requests.map((url) => url.searchParams.get('page'))).toEqual(['1']);
		expect(h.afters(requests)).toEqual(['2026-09-14T23:30:00']);
	});

	it('R4: a non-abort error after a resumable page still forces the next walk full', async () => {
		const h = checkpointSetup(baseRows());
		expect(await h.fetcher(task())).toMatchObject({ completed: false });
		expect(h.blob()).toMatchObject({ walk: { page: 1 } });
		h.state.failNext = true;
		await expect(h.fetcher(task())).rejects.toThrow('500');
		expect(h.requests.at(-1)?.searchParams.get('page')).toBe('2');
		expect(h.blob()).toBeUndefined();
		h.state.now += MIN;
		const next = await h.walkAll(task(), h.build());
		expect(next.map((url) => url.searchParams.get('page'))).toEqual(['1', '2', '3']);
		expect(h.afters(next)).toEqual(Array(3).fill('2026-06-16T00:01:00'));
	});
});
