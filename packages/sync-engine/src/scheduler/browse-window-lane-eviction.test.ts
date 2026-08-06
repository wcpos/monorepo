// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	type BrowseWindowLaneSnapshot,
	evictSupersededBrowseWindowLanes,
	orderBrowseWindowLaneIdentity,
	planBrowseWindowLaneEviction,
	productBrowseWindowLaneIdentity,
} from './browse-window-lane-eviction';

const ids = (count: number, from = 1) =>
	Array.from({ length: count }, (_, index) => `woo-product:${from + index}`);

const productWindow = (limit: number): string => `products:browse-window:limit=${limit}`;

/**
 * A completed products window holding exactly `limit` ids from the head of the catalogue.
 * `updatedAtMs` ascends with the limit, which is the real scroll order: each window is
 * written after the one it grew from.
 */
const filled = (limit: number, complete = true): BrowseWindowLaneSnapshot => ({
	queryKey: productWindow(limit),
	complete,
	expectedRecordIds: ids(limit),
	updatedAtMs: limit,
});

const evictedKeys = (result: { queryKey: string }[]) =>
	result.map((entry) => entry.queryKey).sort();

describe('planBrowseWindowLaneEviction', () => {
	/**
	 * The ruling, stated as a test: scroll 100 → 200 → 400, the 400-row window completes,
	 * and the three windows it strictly contains are gone. This is the whole point — stored
	 * ids drop from 100+200+400 to 400, i.e. from quadratic-in-scroll-depth to ~1× the
	 * deepest window.
	 */
	it('evicts every strictly smaller window the completed one contains', () => {
		const result = planBrowseWindowLaneEviction({
			lanes: [filled(100), filled(200), filled(300), filled(400)],
			triggerQueryKey: productWindow(400),
			identify: productBrowseWindowLaneIdentity,
		});
		expect(evictedKeys(result)).toEqual([
			productWindow(100),
			productWindow(200),
			productWindow(300),
		]);
		expect(result.every((entry) => entry.supersededBy === productWindow(400))).toBe(true);
	});

	/**
	 * The largest lane is the one `projectTotal` reads for the grid's footer (exact queryKey
	 * match). Evicting it — or any lane at or above the trigger's limit — would drop the
	 * footer to the local row count.
	 */
	it('never evicts the completed window itself or a deeper in-flight one', () => {
		const inFlightDeeper: BrowseWindowLaneSnapshot = {
			queryKey: productWindow(500),
			complete: false,
			expectedRecordIds: ids(120),
			updatedAtMs: 500,
		};
		const result = planBrowseWindowLaneEviction({
			lanes: [filled(100), filled(400), inFlightDeeper],
			triggerQueryKey: productWindow(400),
			identify: productBrowseWindowLaneIdentity,
		});
		expect(evictedKeys(result)).toEqual([productWindow(100)]);
	});

	/**
	 * A 400-row window sorted by price is NOT a superset of a 100-row window sorted by
	 * menu_order — they are different slices of the catalogue. Evicting across sorts would
	 * delete real coverage.
	 */
	it('never evicts across sort orders', () => {
		const sorted = (limit: number): BrowseWindowLaneSnapshot => ({
			queryKey: `products:browse-window:limit=${limit}:orderby=price:order=desc`,
			complete: true,
			expectedRecordIds: ids(limit),
			updatedAtMs: limit,
		});
		expect(
			planBrowseWindowLaneEviction({
				lanes: [filled(100), sorted(400)],
				triggerQueryKey: `products:browse-window:limit=400:orderby=price:order=desc`,
				identify: productBrowseWindowLaneIdentity,
			})
		).toEqual([]);
	});

	it('never evicts across filter dimensions', () => {
		const filtered: BrowseWindowLaneSnapshot = {
			queryKey: 'products:browse-window:limit=400:category=7',
			complete: true,
			expectedRecordIds: ids(400),
			updatedAtMs: 400,
		};
		expect(
			planBrowseWindowLaneEviction({
				lanes: [filled(100), filtered],
				triggerQueryKey: filtered.queryKey,
				identify: productBrowseWindowLaneIdentity,
			})
		).toEqual([]);
	});

	/**
	 * Containment is by SET, not by prefix: the products phase-2 tiebreak walk substitutes
	 * rows from later wire pages, so the 400-window's ids need not begin with the
	 * 100-window's ids in order. What must hold is that it holds all of them.
	 */
	it('evicts a contained lane whose ids are not a positional prefix of the survivor', () => {
		const survivor: BrowseWindowLaneSnapshot = {
			queryKey: productWindow(400),
			complete: true,
			expectedRecordIds: [...ids(400)].reverse(),
			updatedAtMs: 400,
		};
		expect(
			evictedKeys(
				planBrowseWindowLaneEviction({
					lanes: [filled(100), survivor],
					triggerQueryKey: productWindow(400),
					identify: productBrowseWindowLaneIdentity,
				})
			)
		).toEqual([productWindow(100)]);
	});

	/** A lane holding an id the survivor does not is not superseded, whatever its limit says. */
	it('keeps a smaller lane the completed window does not actually contain', () => {
		const stale: BrowseWindowLaneSnapshot = {
			queryKey: productWindow(100),
			complete: true,
			expectedRecordIds: [...ids(99), 'woo-product:deleted-since'],
			updatedAtMs: 100,
		};
		expect(
			planBrowseWindowLaneEviction({
				lanes: [stale, filled(400)],
				triggerQueryKey: productWindow(400),
				identify: productBrowseWindowLaneIdentity,
			})
		).toEqual([]);
	});

	/**
	 * A walk cut short by the per-drain page budget wrote a PARTIAL window: neither complete
	 * nor filled to its own limit. It supersedes nothing.
	 */
	it('evicts nothing when the triggering window is neither complete nor filled', () => {
		const partial: BrowseWindowLaneSnapshot = {
			queryKey: productWindow(400),
			complete: false,
			expectedRecordIds: ids(250),
			updatedAtMs: 400,
		};
		expect(
			planBrowseWindowLaneEviction({
				lanes: [filled(100), partial],
				triggerQueryKey: productWindow(400),
				identify: productBrowseWindowLaneIdentity,
			})
		).toEqual([]);
	});

	/**
	 * `complete` alone cannot be the test. An ORDERS window is recorded complete only when
	 * the SERVER ran out of matching orders, so a busy store's order list would never
	 * complete a window and eviction would never fire on the family that bloats fastest.
	 * A window filled to its own limit is settled whatever the flag says.
	 */
	it('accepts a filled-but-not-complete window as the survivor', () => {
		expect(
			evictedKeys(
				planBrowseWindowLaneEviction({
					lanes: [filled(100), filled(400, false)],
					triggerQueryKey: productWindow(400),
					identify: productBrowseWindowLaneIdentity,
				})
			)
		).toEqual([productWindow(100)]);
	});

	/**
	 * THE OSCILLATION GUARD. A grid parked at limit=100 while an earlier scroll's limit=400
	 * lane is still fresh writes its own 100 lane on every pass. If that write evicted — or
	 * were evicted by — the deeper lane, the seeder would see no lane for the window it is
	 * demanding and re-walk it, forever. A pass that is not the deepest complete window of
	 * its view evicts nothing.
	 */
	it('evicts nothing when a deeper complete lane already covers this view', () => {
		expect(
			planBrowseWindowLaneEviction({
				lanes: [filled(100), filled(200), filled(400)],
				triggerQueryKey: productWindow(200),
				identify: productBrowseWindowLaneIdentity,
			})
		).toEqual([]);
	});

	it('ignores lanes that are not browse windows at all', () => {
		expect(
			planBrowseWindowLaneEviction({
				lanes: [
					{
						queryKey: 'products:search:widget',
						complete: true,
						expectedRecordIds: ids(5),
						updatedAtMs: 1,
					},
					filled(400),
				],
				triggerQueryKey: productWindow(400),
				identify: productBrowseWindowLaneIdentity,
			})
		).toEqual([]);
	});
});

describe('orderBrowseWindowLaneIdentity', () => {
	const orderWindow = (limit: number | 'all', tail = '') =>
		`orders:browser:status=all${tail}:search=:limit=${limit}`;

	it('splits an orders window into its view and its limit', () => {
		expect(orderBrowseWindowLaneIdentity(orderWindow(200))).toEqual({
			viewKey: 'orders:browser:status=all:search=:limit=',
			limit: 200,
		});
	});

	/** Below the quantum the orders grid mints a lane per 10 rows — the worst of the bloat. */
	it('evicts the sub-quantum lanes a first page-full of scrolling minted', () => {
		const lanes: BrowseWindowLaneSnapshot[] = [10, 20, 30, 40, 50, 100].map((limit) => ({
			queryKey: orderWindow(limit),
			complete: true,
			expectedRecordIds: ids(limit),
			updatedAtMs: limit,
		}));
		expect(
			evictedKeys(
				planBrowseWindowLaneEviction({
					lanes,
					triggerQueryKey: orderWindow(100),
					identify: orderBrowseWindowLaneIdentity,
				})
			)
		).toEqual([10, 20, 30, 40, 50].map((limit) => orderWindow(limit)).sort());
	});

	/** A ranged Reports fetch is not a scroll window; it must be neither survivor nor victim. */
	it('refuses limit=all ranged report lanes', () => {
		expect(
			orderBrowseWindowLaneIdentity('orders:browser:status=all:after=1:search=:limit=all')
		).toBeNull();
	});

	it('refuses the baseline-in-progress marker lanes', () => {
		expect(
			orderBrowseWindowLaneIdentity(`${orderWindow(100)}:baseline-in-progress:task-1`)
		).toBeNull();
	});

	/** Every other dimension is part of the view: a customer-scoped window is its own family. */
	it('keeps customer-scoped windows in a different view from the unscoped ones', () => {
		expect(
			planBrowseWindowLaneEviction({
				lanes: [
					{
						queryKey: orderWindow(100, ':customer=12'),
						complete: true,
						expectedRecordIds: ids(100),
						updatedAtMs: 100,
					},
					{
						queryKey: orderWindow(200),
						complete: true,
						expectedRecordIds: ids(200),
						updatedAtMs: 200,
					},
				],
				triggerQueryKey: orderWindow(200),
				identify: orderBrowseWindowLaneIdentity,
			})
		).toEqual([]);
	});
});

/** A fake coverage store with the two eviction methods plus the lane reader. */
function fakeRepository(initial: BrowseWindowLaneSnapshot[]) {
	const lanes = new Map(initial.map((lane) => [lane.queryKey, lane]));
	return {
		lanes,
		listCoverageLanes: vi.fn(async () => [...lanes.values()]),
		readLocalLaneCoverage: vi.fn(async (_collection: string, queryKey: string) => {
			const lane = lanes.get(queryKey);
			return lane
				? { complete: lane.complete, fresh: true, expectedRecordIds: [...lane.expectedRecordIds] }
				: null;
		}),
		// Compare-and-delete against the CURRENT stored lane, like the Rx repository does —
		// both conditions, containment AND "not rewritten since the survivor".
		removeCoverageLaneIfContained: vi.fn(
			async (input: {
				queryKey: string;
				containedIn: readonly string[];
				supersededAtMs: number;
			}) => {
				const lane = lanes.get(input.queryKey);
				if (!lane) return false;
				if (lane.updatedAtMs > input.supersededAtMs) return false;
				const containedIn = new Set(input.containedIn);
				if (!lane.expectedRecordIds.every((id) => containedIn.has(id))) return false;
				lanes.delete(input.queryKey);
				return true;
			}
		),
	};
}

describe('evictSupersededBrowseWindowLanes', () => {
	const sweep = (
		repository: ReturnType<typeof fakeRepository> | undefined,
		triggerQueryKey = productWindow(400)
	) =>
		evictSupersededBrowseWindowLanes({
			collection: 'products',
			triggerQueryKey,
			identify: productBrowseWindowLaneIdentity,
			repository,
			nowMs: 1_000,
		});

	it('deletes the superseded lanes and leaves the survivor intact', async () => {
		const repository = fakeRepository([filled(100), filled(200), filled(300), filled(400)]);
		expect((await sweep(repository)).sort()).toEqual([
			productWindow(100),
			productWindow(200),
			productWindow(300),
		]);
		expect([...repository.lanes.keys()]).toEqual([productWindow(400)]);
		// The footer reads expectedRecordIds.length for exactly this key — unchanged.
		expect(repository.lanes.get(productWindow(400))!.expectedRecordIds).toHaveLength(400);
	});

	it('is a no-op on a host whose coverage repository has no eviction surface', async () => {
		await expect(sweep(undefined)).resolves.toEqual([]);
	});

	it('does not read storage for a lane write that is not a browse window', async () => {
		const repository = fakeRepository([filled(400)]);
		expect(await sweep(repository, 'products:search:widget')).toEqual([]);
		expect(repository.listCoverageLanes).not.toHaveBeenCalled();
	});

	/**
	 * EVICTION vs CONCURRENT WIPE. A Clear & Sync (or a ledger rebuild) removes the
	 * collection's lanes between the plan and the delete. The survivor no longer exists, so
	 * it is no authority to delete anything: the sweep abandons the pass rather than acting
	 * on a pre-wipe snapshot.
	 */
	it('abandons the sweep when a wipe removes the survivor mid-pass', async () => {
		const repository = fakeRepository([filled(100), filled(400)]);
		repository.readLocalLaneCoverage.mockImplementationOnce(async () => {
			repository.lanes.clear();
			return null;
		});
		const diagnostics = vi.fn();
		expect(
			await evictSupersededBrowseWindowLanes({
				collection: 'products',
				triggerQueryKey: productWindow(400),
				identify: productBrowseWindowLaneIdentity,
				repository,
				nowMs: 1_000,
				diagnostics,
			})
		).toEqual([]);
		expect(repository.removeCoverageLaneIfContained).not.toHaveBeenCalled();
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'browse-window.eviction-skipped' })
		);
	});

	/** A survivor a racing writer demoted to a partial window is likewise no authority. */
	it('abandons the sweep when the survivor is no longer settled at delete time', async () => {
		const repository = fakeRepository([filled(100), filled(400)]);
		repository.readLocalLaneCoverage.mockImplementationOnce(async () => ({
			complete: false,
			fresh: true,
			expectedRecordIds: ids(250),
		}));
		expect(await sweep(repository)).toEqual([]);
		expect(repository.lanes.has(productWindow(100))).toBe(true);
	});

	/**
	 * EVICTION vs AN IN-FLIGHT SMALLER WALK. The smaller window's pass writes its lane
	 * between the plan and the delete. The delete re-checks containment against what is
	 * ACTUALLY stored, so a lane that grew past the survivor survives — the sweep can never
	 * delete coverage the survivor does not hold.
	 */
	it('refuses to delete a lane a racing walk grew beyond the survivor', async () => {
		const repository = fakeRepository([filled(100), filled(400)]);
		repository.removeCoverageLaneIfContained.mockImplementationOnce(async (input) => {
			repository.lanes.set(input.queryKey, {
				queryKey: input.queryKey,
				complete: true,
				expectedRecordIds: [...ids(100), 'woo-product:written-by-a-racing-walk'],
				updatedAtMs: 100,
			});
			const lane = repository.lanes.get(input.queryKey)!;
			const containedIn = new Set(input.containedIn);
			return lane.expectedRecordIds.every((id) => containedIn.has(id));
		});
		expect(await sweep(repository)).toEqual([]);
		expect(repository.lanes.has(productWindow(100))).toBe(true);
	});

	/**
	 * REGRESSION — deleting a lane a walk JUST WROTE (adversarial review, 2026-08-06).
	 *
	 * The limit=100 walk finishes between the sweep planning its deletion and the delete
	 * landing. Its lane holds the SAME window and the SAME ids, so containment alone cannot
	 * tell it apart from the stale one that was planned for deletion — and deleting it would
	 * strip the coverage of a window something is actively demanding, dropping the grid's
	 * footer to the local count and forcing another walk. `updatedAtMs > supersededAtMs` is
	 * what tells them apart: a rewrite is not stale knowledge.
	 */
	it('refuses to delete a lane rewritten after the survivor', async () => {
		const repository = fakeRepository([filled(100), filled(400)]);
		repository.removeCoverageLaneIfContained.mockImplementationOnce(async (input) => {
			// The 100 walk lands, rewriting the identical window at a LATER timestamp.
			repository.lanes.set(input.queryKey, { ...filled(100), updatedAtMs: 401 });
			const lane = repository.lanes.get(input.queryKey)!;
			if (lane.updatedAtMs > input.supersededAtMs) return false;
			repository.lanes.delete(input.queryKey);
			return true;
		});
		expect(await sweep(repository)).toEqual([]);
		expect(repository.lanes.get(productWindow(100))!.expectedRecordIds).toHaveLength(100);
	});

	/**
	 * RESURRECTION. A smaller walk that lands AFTER the sweep re-creates its lane. That is
	 * bounded, not prevented (preventing it means evicting on every completion, which loops
	 * — see the oscillation guard above): the resurrected lane is not re-evicted by its own
	 * completion, and the next growth step collects it.
	 */
	it('collects a resurrected lane on the next growth step, and not before', async () => {
		const repository = fakeRepository([filled(100), filled(200), filled(400)]);
		await sweep(repository);
		expect([...repository.lanes.keys()]).toEqual([productWindow(400)]);

		// The in-flight limit=200 walk finishes and writes its lane back.
		repository.lanes.set(productWindow(200), filled(200));
		// Its own completion must NOT evict it (400 is deeper) — that is the oscillation guard.
		expect(await sweep(repository, productWindow(200))).toEqual([]);
		expect(repository.lanes.has(productWindow(200))).toBe(true);

		// The next growth step does collect it, so bookkeeping stays ~1× the deepest window.
		repository.lanes.set(productWindow(500), filled(500));
		expect(await sweep(repository, productWindow(500))).toEqual(
			expect.arrayContaining([productWindow(200), productWindow(400)])
		);
		expect([...repository.lanes.keys()]).toEqual([productWindow(500)]);
	});

	/**
	 * The bound Paul asked for, measured. Scrolling to 4,000 rows used to leave 82,000 ids
	 * across 40 lanes; with eviction it leaves one lane of 4,000.
	 */
	it('bounds stored ids to ~1x the deepest window across a full scroll', async () => {
		const repository = fakeRepository([]);
		for (let limit = 100; limit <= 4_000; limit += 100) {
			repository.lanes.set(productWindow(limit), filled(limit));
			await sweep(repository, productWindow(limit));
		}
		expect(repository.lanes.size).toBe(1);
		const stored = [...repository.lanes.values()].reduce(
			(total, lane) => total + lane.expectedRecordIds.length,
			0
		);
		expect(stored).toBe(4_000);
	});
});
