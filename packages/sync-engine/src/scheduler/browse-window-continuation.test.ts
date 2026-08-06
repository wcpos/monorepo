// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT,
	browseWindowPrefixSurvived,
	clampToBrowseWindowBackstop,
	isBrowseWindowLimit,
	mergeBrowseWindowRecordIds,
	NO_BROWSE_WINDOW_CONTINUATION,
	readBrowseWindowContinuation,
} from './browse-window-continuation';

const ids = (from: number, count: number) =>
	Array.from({ length: count }, (_, index) => `woo-product:${from + index}`);

/** A lane reader over a fixed snapshot of lanes. */
const laneReader = (lanes: Record<string, { complete: boolean; fresh?: boolean; ids: string[] }>) =>
	vi.fn(async (_collection: string, queryKey: string) => {
		const lane = lanes[queryKey];
		return lane
			? { complete: lane.complete, fresh: lane.fresh ?? true, expectedRecordIds: lane.ids }
			: null;
	});

const continuationFor = (
	lanes: Record<string, { complete: boolean; fresh?: boolean; ids: string[] }>,
	overrides: Partial<Parameters<typeof readBrowseWindowContinuation>[0]> = {}
) =>
	readBrowseWindowContinuation({
		collection: 'products',
		ownQueryKey: 'products:browse-window:limit=300',
		predecessorQueryKey: 'products:browse-window:limit=200',
		predecessorLimit: 200,
		limit: 300,
		nowMs: 1_000,
		readLane: laneReader(lanes),
		...overrides,
	});

describe('readBrowseWindowContinuation', () => {
	// The ordinary scroll case: the previous tick's lane is the prefix this one resumes from.
	it('resumes from the predecessor window that the previous scroll tick filled', async () => {
		expect(
			await continuationFor({
				'products:browse-window:limit=200': { complete: true, ids: ids(1, 200) },
			})
		).toEqual({
			satisfied: false,
			covered: 200,
			recordIds: ids(1, 200),
			sourceQueryKey: 'products:browse-window:limit=200',
		});
	});

	/**
	 * The `complete` flag alone cannot be the test: an ORDERS window records complete only
	 * when the server ran out of matching orders, so a filled-but-not-exhausted 200-row
	 * window is `complete: false` and would never be reusable. "Filled to its own limit" is
	 * the property that actually travels across both lanes.
	 */
	it('resumes from a filled predecessor even when the lane is not marked complete', async () => {
		expect(
			await continuationFor({
				'products:browse-window:limit=200': { complete: false, ids: ids(1, 200) },
			})
		).toMatchObject({ covered: 200, satisfied: false });
	});

	// A half-filled predecessor proves nothing about rows 100–200, so the walk restarts.
	it('ignores a predecessor that never filled', async () => {
		expect(
			await continuationFor({
				'products:browse-window:limit=200': { complete: false, ids: ids(1, 90) },
			})
		).toEqual(NO_BROWSE_WINDOW_CONTINUATION);
	});

	it('ignores a stale predecessor, so the window is periodically re-walked in full', async () => {
		expect(
			await continuationFor({
				'products:browse-window:limit=200': { complete: true, fresh: false, ids: ids(1, 200) },
			})
		).toEqual(NO_BROWSE_WINDOW_CONTINUATION);
	});

	// Serving a fresh, settled window from coverage is what stops the seeder's 30s
	// completed-dedupe from re-fetching a deep window's tail twice a minute forever.
	it('reports a fresh, settled own lane as satisfied', async () => {
		expect(
			await continuationFor({
				'products:browse-window:limit=300': { complete: true, ids: ids(1, 300) },
			})
		).toMatchObject({ satisfied: true });
	});

	// A drain cut short by the page budget leaves a short lane; the next pass continues it.
	it('resumes its own short lane left by a page-budget truncation', async () => {
		expect(
			await continuationFor({
				'products:browse-window:limit=300': { complete: false, ids: ids(1, 150) },
			})
		).toMatchObject({ covered: 150, sourceQueryKey: 'products:browse-window:limit=300' });
	});

	it('refuses every continuation for an explicitly requested refresh', async () => {
		expect(
			await continuationFor(
				{ 'products:browse-window:limit=200': { complete: true, ids: ids(1, 200) } },
				{ forceRefresh: true }
			)
		).toEqual(NO_BROWSE_WINDOW_CONTINUATION);
	});

	it('falls back to a full walk when the host wires no coverage at all', async () => {
		expect(await continuationFor({}, { readLane: undefined })).toEqual(
			NO_BROWSE_WINDOW_CONTINUATION
		);
	});
});

describe('browseWindowPrefixSurvived', () => {
	const continuation = {
		satisfied: false,
		covered: 200,
		recordIds: ids(1, 200),
		sourceQueryKey: 'products:browse-window:limit=200',
	};

	it('accepts a prefix whose source lane is unchanged', async () => {
		expect(
			await browseWindowPrefixSurvived({
				collection: 'products',
				continuation,
				nowMs: 1_000,
				readLane: laneReader({
					'products:browse-window:limit=200': { complete: true, ids: ids(1, 200) },
				}),
			})
		).toBe(true);
	});

	// Clear & Sync bulk-removes the collection's coverageLanes rows; a ledger rebuild drops
	// the collection whole. Either can land between the read and the write.
	it('refuses a prefix whose source lane was wiped mid-walk', async () => {
		expect(
			await browseWindowPrefixSurvived({
				collection: 'products',
				continuation,
				nowMs: 1_000,
				readLane: laneReader({}),
			})
		).toBe(false);
	});

	it('refuses a prefix another writer moved out from under it', async () => {
		expect(
			await browseWindowPrefixSurvived({
				collection: 'products',
				continuation,
				nowMs: 1_000,
				readLane: laneReader({
					'products:browse-window:limit=200': { complete: true, ids: ids(9_000, 200) },
				}),
			})
		).toBe(false);
	});

	it('has nothing to guard when no prefix was carried', async () => {
		expect(
			await browseWindowPrefixSurvived({
				collection: 'products',
				continuation: NO_BROWSE_WINDOW_CONTINUATION,
				nowMs: 1_000,
				readLane: laneReader({}),
			})
		).toBe(true);
	});
});

describe('browse window backstop helpers', () => {
	it('accepts any scrolled-to window and refuses only past the runaway backstop', () => {
		expect(isBrowseWindowLimit(1)).toBe(true);
		expect(isBrowseWindowLimit(25_000)).toBe(true);
		expect(isBrowseWindowLimit(BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT)).toBe(true);
		expect(isBrowseWindowLimit(BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT + 1)).toBe(false);
		expect(isBrowseWindowLimit(0)).toBe(false);
		expect(isBrowseWindowLimit(1.5)).toBe(false);
		expect(clampToBrowseWindowBackstop(Number.MAX_SAFE_INTEGER)).toBe(
			BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT
		);
	});

	it('unions a prefix with a delta without duplicating the page seam', () => {
		expect(
			mergeBrowseWindowRecordIds(
				['woo-order:3', 'woo-order:2'],
				['woo-order:2', 'woo-order:1', 'woo-order:1']
			)
		).toEqual(['woo-order:3', 'woo-order:2', 'woo-order:1']);
	});
});
