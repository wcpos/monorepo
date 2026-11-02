import { describe, expect, it, vi } from 'vitest';

import { buildCoverageDocumentsFromQueryResult } from './query-coverage-writes';
import { createRefundsSchedulerFetcher } from './rx-scheduler-refund-fetcher';

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
				after: '2026-06-16T00:00:00.000Z',
				dates_are_gmt: '1',
				orderby: 'id',
				order: 'asc',
				per_page: '100',
				page: '1',
			},
			{
				after: '2026-06-16T00:00:00.000Z',
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
