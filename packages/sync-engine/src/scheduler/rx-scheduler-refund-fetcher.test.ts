import { describe, expect, it } from 'vitest';

import { createRefundsSchedulerFetcher } from './rx-scheduler-refund-fetcher';

import type { FetchTask } from './replication-policy';
import type { LocalRefundDocument } from '../collections/refund-schema';
import type { BuildCoverageDocumentsFromQueryResultInput } from './query-coverage-writes';

const row = (id: number, parent_id = 42, meta_data: { key: string; value: string }[] = []) => ({
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
	held = new Map<number, number[] | null>([[42, null]])
) {
	const documents: LocalRefundDocument[] = [];
	const requests: URL[] = [];
	const coverage: BuildCoverageDocumentsFromQueryResultInput[] = [];
	let now = Date.parse('2026-09-16T00:00:00Z');
	const fetcher = createRefundsSchedulerFetcher({
		baseUrl: 'https://example.test/wp-json/wcpos/v2',
		nowMs: () => now,
		heldParentIds: async () => held,
		repository: {
			upsertMany: async (rows) => {
				documents.push(...rows);
			},
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
	return { fetcher, documents, requests, coverage };
}

describe('refund paged upsert-only fetcher', () => {
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
		expect(h.coverage.at(-1)?.records).toHaveLength(101);
	});
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
