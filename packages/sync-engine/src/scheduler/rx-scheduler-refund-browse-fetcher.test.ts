import { describe, expect, it, vi } from 'vitest';

import { parseWooGmtSeconds } from './__fixtures__/woo-gmt-bound';
import { createRefundBrowseSchedulerFetcher } from './rx-scheduler-refund-browse-fetcher';

import type { RefundSchedulerFetcherInput } from './rx-scheduler-refund-fetcher';
import type { FetchTask } from './replication-policy';
import type { RangedLaneResumeState } from './persisted-coverage-schema';

const task: FetchTask = {
	id: 'refunds:browser:after=100:before=20000:limit=all:windowed',
	requirementId: 'browse',
	queryKey: 'refunds:browser:after=100:before=20000:limit=all',
	collection: 'refunds',
	limit: 10000,
	priority: 700,
	mode: 'greedy',
};
function fixture(count: number, metaData = [{ key: '_wcpos_session', value: 'session' }]) {
	let lane: {
		complete: boolean;
		fresh: boolean;
		expectedRecordIds: string[];
		rangedResume?: RangedLaneResumeState;
	} | null = null;
	const requests: URL[] = [];
	const input: RefundSchedulerFetcherInput = {
		baseUrl: 'https://example.test/wcpos/v2',
		heldParentIds: async () => new Map(),
		repository: { upsertMany: async (docs) => docs, removeMany: async () => undefined },
		fetcher: async (url) => {
			const query = new URL(url);
			requests.push(query);
			const after = parseWooGmtSeconds(query.searchParams.get('after')!);
			const before = parseWooGmtSeconds(query.searchParams.get('before')!);
			const exclude = new Set((query.searchParams.get('exclude') ?? '').split(',').map(Number));
			const remaining = Array.from({ length: count }, (_, i) => ({ id: i + 1, seconds: 101 + i }))
				.filter(({ id, seconds }) => seconds > after && seconds < before && !exclude.has(id))
				.reverse();
			const perPage = Number(query.searchParams.get('per_page'));
			return Response.json(
				remaining.slice(0, perPage).map(({ id, seconds }) => ({
					id,
					parent_id: 42,
					date_created_gmt: new Date(seconds * 1000).toISOString().replace('Z', ''),
					meta_data: metaData,
				})),
				{
					headers: {
						'X-WP-Total': String(remaining.length),
						'X-WP-TotalPages': String(Math.ceil(remaining.length / perPage)),
					},
				}
			);
		},
		coverageRepository: {
			recordQueryResult: async () => undefined,
			readLocalLaneCoverage: async () => lane,
			recordCumulativeQueryResult: async (value) => {
				lane = {
					complete: value.complete,
					fresh: true,
					expectedRecordIds: [
						...new Set([
							...(value.resetCumulativeExpectedIds ? [] : (lane?.expectedRecordIds ?? [])),
							...value.records.map(({ id }) => id),
						]),
					],
					...(value.rangedResume ? { rangedResume: value.rangedResume } : {}),
				};
			},
		},
	};
	return { input, requests, lane: () => lane };
}

describe('refund browse walker', () => {
	it.each([
		{
			offset: 60,
			startSeconds: Date.UTC(2026, 10, 8, 23) / 1000,
			endSeconds: Date.UTC(2026, 10, 15, 22, 59, 59) / 1000,
			after: '2026-11-08T22:59:59',
			before: '2026-11-15T23:00:00',
		},
		{
			offset: 0,
			startSeconds: Date.UTC(2026, 10, 9) / 1000,
			endSeconds: Date.UTC(2026, 10, 15, 23, 59, 59) / 1000,
			after: '2026-11-08T23:59:59',
			before: '2026-11-16T00:00:00',
		},
		{
			offset: -300,
			startSeconds: Date.UTC(2026, 10, 9, 5) / 1000,
			endSeconds: Date.UTC(2026, 10, 16, 4, 59, 59) / 1000,
			after: '2026-11-09T04:59:59',
			before: '2026-11-16T05:00:00',
		},
		{
			offset: 330,
			startSeconds: Date.UTC(2026, 10, 8, 18, 30) / 1000,
			endSeconds: Date.UTC(2026, 10, 15, 18, 29, 59) / 1000,
			after: '2026-11-08T18:29:59',
			before: '2026-11-15T18:30:00',
		},
	])(
		'sends bare GMT bounds at site offset $offset minutes',
		async ({ startSeconds, endSeconds, after, before }) => {
			const f = fixture(0);
			const queryKey = `refunds:browser:after=${startSeconds}:before=${endSeconds}:limit=all`;
			await createRefundBrowseSchedulerFetcher(f.input)({ ...task, queryKey });
			expect(f.requests[0].searchParams.get('after')).toBe(after);
			expect(f.requests[0].searchParams.get('before')).toBe(before);
		}
	);

	// Pass the till's scope to browse admission: store 2's refund never reaches Reports.
	it('a store-scoped till stores a POS refund of another store (reports cover every store)', async () => {
		const f = fixture(2, [
			{ key: '_pos_store', value: '2' },
			{ key: '_pos_user', value: '7' },
		]);
		f.input.scope = { storeId: 1 };
		const upsert = vi.spyOn(f.input.repository, 'upsertMany');
		const remove = vi.spyOn(f.input.repository, 'removeMany');
		expect(await createRefundBrowseSchedulerFetcher(f.input)(task)).toMatchObject({
			documentCount: 2,
		});
		expect(upsert.mock.calls.flatMap(([docs]) => docs.map((doc) => doc.payload.id))).toEqual([
			2, 1,
		]);
		expect(remove).not.toHaveBeenCalled();
		expect(f.lane()?.expectedRecordIds).toEqual(['woo-refund:2', 'woo-refund:1']);
	});

	it("a refund created exactly on the window's bounds is fetched", async () => {
		const f = fixture(4);
		const upsert = vi.spyOn(f.input.repository, 'upsertMany');
		const queryKey = 'refunds:browser:after=102:before=103:limit=all';
		expect(await createRefundBrowseSchedulerFetcher(f.input)({ ...task, queryKey })).toMatchObject({
			completed: true,
			documentCount: 2,
		});
		expect(upsert.mock.calls.flatMap(([docs]) => docs.map((doc) => doc.payload.id))).toEqual([
			3, 2,
		]);
		expect(f.lane()?.expectedRecordIds).toEqual(['woo-refund:3', 'woo-refund:2']);
		expect(f.requests[0].searchParams.get('after')).toBe('1970-01-01T00:01:41');
		expect(f.requests[0].searchParams.get('before')).toBe('1970-01-01T00:01:44');
	});

	it('continues beyond the 10000-record pass budget without re-downloading the prefix', async () => {
		const f = fixture(10001);
		const fetch = createRefundBrowseSchedulerFetcher(f.input);
		expect(await fetch(task)).toMatchObject({
			completed: false,
			documentCount: 10000,
			requestCount: 100,
		});
		expect(f.lane()?.rangedResume).toMatchObject({ downloadedRecords: 10000, totalRecords: 10001 });
		expect(await fetch(task)).toMatchObject({ completed: true, documentCount: 1, requestCount: 1 });
		expect(f.lane()?.expectedRecordIds).toHaveLength(10001);
		expect(f.lane()?.rangedResume).toBeUndefined();
	});
	it('a fresh walk after a completed lane starts downloaded progress from zero', async () => {
		const f = fixture(101);
		await createRefundBrowseSchedulerFetcher(f.input)(task);
		const write = vi.spyOn(f.input.coverageRepository!, 'recordCumulativeQueryResult');
		await createRefundBrowseSchedulerFetcher(f.input)(task);
		expect(write.mock.calls[0][0].rangedResume).toMatchObject({
			downloadedRecords: 100,
			totalRecords: 101,
		});
	});
	it('a forced refresh restarts once, not on every greedy pass', async () => {
		const f = fixture(10001);
		await createRefundBrowseSchedulerFetcher(f.input)(task);
		f.input.refreshBrowseWindowKey = task.queryKey;
		const fetch = createRefundBrowseSchedulerFetcher(f.input);
		expect(await fetch(task)).toMatchObject({ completed: false, documentCount: 10000 });
		expect(f.requests[100].searchParams.get('before')).toBe('1970-01-01T05:33:21');
		expect(await fetch(task)).toMatchObject({ completed: true, documentCount: 1 });
	});
});
