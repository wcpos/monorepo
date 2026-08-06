/**
 * SUPERSEDED BROWSE-WINDOW LANES ARE EVICTED, NOT LEFT TO EXPIRE (#948/#957 follow-up).
 *
 * Paul's ruling, 2026-08-06:
 *
 * > Eagerly evict superseded browse-window coverage lanes — when a grown window (e.g.
 * > limit=400) completes, delete the strictly-contained smaller lanes of the same view
 * > (100, 200, 300).
 *
 * ## The bookkeeping the continuation left behind
 *
 * Removing the scroll caps made every growth step mint its OWN coverage lane, keyed by
 * `(view dimensions, limit)`. Scrolling a products grid to 4,000 rows leaves lanes at
 * limit=100, 200, 300 … 4,000 — forty lanes holding 100 + 200 + … + 4,000 = 82,000 record
 * ids to describe a 4,000-row window. Stored ids are QUADRATIC in scroll depth
 * (`limit²/2·step`) while the information content is linear, because every smaller lane is
 * a strict subset of the largest. Only the 15-minute freshness expiry and the compaction
 * pass reclaimed it, so the PEAK — which is what a device with a small storage quota
 * actually feels — was the quadratic number.
 *
 * Eviction swaps expiry-based reclaim for supersession-based reclaim: the moment a larger
 * window is known to CONTAIN a smaller one, the smaller one goes. The `coverageLanes`
 * collection then holds ~1× the deepest window instead of ~(depth/step)/2 ×.
 *
 * ## What this does NOT bound (measured, not assumed)
 *
 * The RECORD side keeps a parallel membership that eviction does not touch:
 * `recordQueryResult` appends the lane's key to every covered record's `coveredQueryKeys`,
 * and that union is never pruned, so an evicted window's key outlives its lane. Scrolling to
 * 4,000 rows therefore still leaves ~82,000 key memberships spread across the 4,000 coverage
 * RECORDS — the same quadratic sum, in queryKey strings rather than id arrays. (A membership
 * string is in fact the longer of the two, so this is the larger half of the problem.)
 *
 * That is a real limit on what this change delivers, and it is stated here rather than
 * quietly implied away. Pruning it from the sweep is not viable at this seam: evicting the
 * 3,900-row lane at the 4,000 tick would mean rewriting 3,900 record documents, which makes
 * the WORK quadratic to stop the STORAGE being quadratic. The fix belongs on the record
 * side — browse windows arguably should not stamp per-window membership on records at all,
 * since a browse lane's membership is already implied by its own `expectedRecordIds` — and
 * is tracked separately. `ledger-storage-recovery.test.ts` pins the current behaviour so the
 * gap cannot be mistaken for a bound this module provides.
 *
 * ## Why deleting a lane is the safe direction
 *
 * This is the mirror image of the prefix-ancestry guard in browse-window-continuation.ts,
 * and the risk profile is inverted. That guard exists because WRITING a lane the database no
 * longer backs makes the grid believe in coverage it does not have — a lie with no
 * self-correction until expiry. Eviction only ever REMOVES bookkeeping, and an absent lane
 * is already a first-class state at every read site:
 *
 *  - `readBrowseWindowContinuation` reads an absent lane as "nothing covered" and walks the
 *    window from the top;
 *  - `projectTotal` matches lanes by EXACT queryKey and falls back to the local row count
 *    when there is no fresh complete lane — the same fallback an expired lane already takes;
 *  - the derivable-coverage contract (#942/#956/#959) says the whole `coverageLanes`
 *    collection can be dropped and rebuilt from the wire, so absence is never a corruption
 *    signal — the ledger-rebuild path treats an evicted lane as an ordinary absent one.
 *
 * The worst case of a wrong eviction is one wasted re-walk of a window, bounded by
 * `BROWSE_WINDOW_MAX_PAGES_PER_DRAIN`. The worst case of a wrong retention is a grid
 * reporting a total it cannot show. We take the first every time.
 *
 * ## What "superseded" means, exactly
 *
 * Narrow on purpose. A lane is evicted only when ALL of these hold:
 *
 *  1. **Same view.** Same collection AND identical dimensions — filters, sort, search,
 *     customer/cashier/store/date scope — differing ONLY in `limit`. Never across sorts:
 *     `menu_order asc` limit=400 and `price desc` limit=100 are different slices of the
 *     catalogue and the larger does not contain the smaller.
 *  2. **Strictly smaller.** `limit(evicted) < limit(survivor)`.
 *  3. **The survivor is SETTLED** — `complete === true`, or it holds at least its own
 *     `limit` in ids. The same two-sided notion `readBrowseWindowContinuation` uses to
 *     decide a predecessor is reusable, and for the same reason: `complete` alone is not
 *     the property. An ORDERS window records complete only when the SERVER ran out of
 *     matching orders, so a cashier scrolling a busy store's order list would never
 *     complete a window and eviction would never fire on the lane family that bloats
 *     fastest. "Filled to its own limit" is what actually travels across both lanes. A
 *     lane that is neither — a walk cut short by the per-drain page budget, or a
 *     dedupe-shortened window — supersedes nothing.
 *  4. **Actual containment.** Every id of the evicted lane is in the survivor's
 *     `expectedRecordIds`. Set containment, NOT prefix containment: the products phase-2
 *     tiebreak walk substitutes rows from later wire pages, so a 400-row window is "the 400
 *     lowest ids in wire[0, 2300)" and need not begin with the 100-row window's ids in
 *     order. Containment is what justifies the delete; ordering is not.
 *
 * Condition 4 is re-checked against the STORED lane at delete time, not against the copy the
 * plan was built from, and the delete adds a fifth condition the plan cannot see: the lane
 * must not have been REWRITTEN since the survivor was. Eviction is a claim about stale
 * knowledge, and a lane a live walk just produced is not stale — see
 * {@link evictSupersededBrowseWindowLanes}.
 *
 * ## Why eviction is TRIGGERED BY, and scoped to, the pass that just completed
 *
 * The tempting shape is a periodic sweep that normalizes every view. It oscillates. A grid
 * sitting at limit=100 while a limit=400 lane from an earlier scroll is still fresh would
 * have its own 100 lane deleted the moment it was written — and the seeder, seeing no lane
 * for the window it is demanding, re-walks it, which writes it, which evicts it, forever.
 * An eviction that deletes a lane something is still ASKING FOR is a fetch loop, not a
 * saving.
 *
 * So the sweep runs only from a browse-window lane write, and only when the lane that pass
 * just wrote is itself the DEEPEST SETTLED lane of its view. A pass filling a window that
 * some deeper lane already covers evicts nothing. This makes the demand relationship
 * implicit but sound: a window smaller than the one just filled is a window the grid has
 * already scrolled past, and nothing is asking for it.
 *
 * The same rule bounds the in-flight-walk race. A smaller window's walk that was already in
 * flight when the deeper one settled writes its lane AFTER the eviction ran, resurrecting
 * it. That resurrected lane is NOT re-evicted by its own pass (it is not the deepest), so it
 * survives until the next growth step settles or it expires. Be precise about the bound: it
 * is one window per CONCURRENTLY IN-FLIGHT smaller walk, not one in total — a drain holding
 * claims on the 100, 200 and 300 tasks when 400 settles resurrects all three. Transient, and
 * no worse than the pre-eviction steady state for those lanes. That is the deliberate cost
 * of never deleting a lane a live pass is about to write; the alternative (evicting on every
 * write) is the oscillation above.
 *
 * ## The one accepted cost: two grids on the same view at different depths
 *
 * If two screens share a view identity (same collection, same sort, same filters) and one is
 * scrolled deeper, the deeper one's pass evicts the shallower one's lane. The shallow grid's
 * footer falls back to its local row count and its next pass re-walks one window — then
 * writes its lane back, and does NOT evict (it is not the deepest), so the lane stays. It
 * cannot loop, because the deep window is served local while it is fresh and a serve-local
 * pass never reaches this sweep. Cost: one re-walk per expiry cycle, in a configuration two
 * grids have to be sharing.
 */

import type { SyncObserver } from '@wcpos/sync-core';

import { parseOrderBrowserSchedulerDescriptor } from './order-browser-scheduler-descriptor';
import {
	parseProductBrowseWindowDescriptor,
	productBrowseWindowQueryKey,
} from './product-browse-window-descriptor';

import type { BrowseWindowLaneReader } from './browse-window-continuation';

/** The subset of a stored coverage lane that eviction reasons about. */
export type BrowseWindowLaneSnapshot = {
	queryKey: string;
	complete: boolean;
	expectedRecordIds: readonly string[];
	/**
	 * When the lane was last written. Eviction is a claim about STALE knowledge — "a deeper
	 * window already knows everything this one did" — so a lane written AFTER the survivor is
	 * not superseded by it, whatever its ids say. See `removeCoverageLaneIfContained`.
	 */
	updatedAtMs: number;
};

/** A browse-window lane key split into "which view" and "how deep". */
export type BrowseWindowLaneIdentity = {
	/** Canonical identity of the view: every dimension EXCEPT the window size. */
	viewKey: string;
	/** The window size the lane describes. */
	limit: number;
};

/** Maps a lane's queryKey to its view/limit identity; null when it is not a browse window. */
export type BrowseWindowLaneIdentifier = (queryKey: string) => BrowseWindowLaneIdentity | null;

export type BrowseWindowLaneEviction = {
	/** The lane to delete. */
	queryKey: string;
	/** The completed larger lane of the same view that contains it. */
	supersededBy: string;
};

/**
 * The products lane family. The limit is the FIRST field of that grammar, so the view
 * identity is re-encoded through the canonical encoder with a sentinel limit rather than by
 * string surgery — a dimension the encoder can express but a hand-rolled strip could not
 * would otherwise collapse two views into one and evict across filters.
 */
export const productBrowseWindowLaneIdentity: BrowseWindowLaneIdentifier = (queryKey) => {
	const descriptor = parseProductBrowseWindowDescriptor(queryKey);
	if (!descriptor) return null;
	return {
		viewKey: productBrowseWindowQueryKey(
			0,
			{ orderby: descriptor.orderby, order: descriptor.order },
			descriptor
		),
		limit: descriptor.limit,
	};
};

/**
 * The orders lane family. `:limit=N` is the LAST field of that grammar (search is free text
 * and must stay second-to-last), so stripping the suffix is exact — the same move
 * `orderBrowserPredecessorWindow` makes.
 *
 * `limit=all` is deliberately excluded: a ranged fetch-to-completion (Reports) is not a
 * scroll window, its lane is written cumulatively, and it must be neither survivor nor
 * victim. The orders baseline marker keys (`…:baseline-in-progress:<taskId>`) do not parse
 * as descriptors at all, so they are excluded by construction.
 */
export const orderBrowseWindowLaneIdentity: BrowseWindowLaneIdentifier = (queryKey) => {
	const descriptor = parseOrderBrowserSchedulerDescriptor(queryKey)?.descriptor;
	// `complete` on an orders descriptor means `limit=all`, not "the walk finished".
	if (!descriptor || descriptor.complete) return null;
	const suffix = `:limit=${descriptor.limit}`;
	if (!queryKey.endsWith(suffix)) return null;
	return { viewKey: `${queryKey.slice(0, -suffix.length)}:limit=`, limit: descriptor.limit };
};

/**
 * A window is SETTLED when the walk that wrote it either exhausted the server or filled the
 * window to its own size. Only a settled window supersedes anything — see condition 3 in the
 * module docblock for why `complete` alone is not the test.
 */
export function isSettledBrowseWindowLane(
	lane: Pick<BrowseWindowLaneSnapshot, 'complete' | 'expectedRecordIds'>,
	limit: number
): boolean {
	return lane.complete || lane.expectedRecordIds.length >= limit;
}

/**
 * Decide which lanes the just-completed `triggerQueryKey` supersedes. Pure: it never touches
 * storage, so the whole supersession rule is testable without a database.
 *
 * Returns nothing unless the trigger lane is present, settled, and the DEEPEST settled lane
 * of its view — see the trigger-scoping rationale in the module docblock.
 */
export function planBrowseWindowLaneEviction(input: {
	lanes: readonly BrowseWindowLaneSnapshot[];
	triggerQueryKey: string;
	identify: BrowseWindowLaneIdentifier;
}): BrowseWindowLaneEviction[] {
	const trigger = input.identify(input.triggerQueryKey);
	if (!trigger) return [];
	const survivor = input.lanes.find((lane) => lane.queryKey === input.triggerQueryKey);
	if (!survivor || !isSettledBrowseWindowLane(survivor, trigger.limit)) return [];

	const sameView: { lane: BrowseWindowLaneSnapshot; limit: number }[] = [];
	for (const lane of input.lanes) {
		const identity = input.identify(lane.queryKey);
		if (identity?.viewKey === trigger.viewKey) sameView.push({ lane, limit: identity.limit });
	}
	// A deeper settled lane already covers this window; evicting from here would delete lanes
	// the grid may still be demanding. Leave the whole view alone.
	const deeperSettled = sameView.some(
		(entry) => entry.limit > trigger.limit && isSettledBrowseWindowLane(entry.lane, entry.limit)
	);
	if (deeperSettled) return [];

	const survivorIds = new Set(survivor.expectedRecordIds);
	return sameView
		.filter(
			(entry) =>
				entry.limit < trigger.limit &&
				entry.lane.expectedRecordIds.every((id) => survivorIds.has(id))
		)
		.map((entry) => ({ queryKey: entry.lane.queryKey, supersededBy: input.triggerQueryKey }));
}

/**
 * Storage the sweep needs. Both members are OPTIONAL on the coverage repositories the
 * fetchers receive, so a host wired without them (the playground, older tests) keeps the
 * pre-eviction behaviour — lanes reclaim on the 15-minute expiry as before — rather than
 * failing.
 */
export type BrowseWindowLaneEvictionRepository = {
	/** Every coverage lane of one collection. Served by the `['collectionName','queryKey']` index. */
	listCoverageLanes?: (collection: string) => Promise<BrowseWindowLaneSnapshot[]>;
	/**
	 * Delete a lane IF, at the moment of deletion, the stored lane's ids are still contained
	 * by `containedIn` AND it has not been rewritten since `supersededAtMs`. Compare-and-delete
	 * against the current revision — the guard that makes this safe against writers racing the
	 * sweep. Returns whether it deleted.
	 */
	removeCoverageLaneIfContained?: (input: {
		collection: string;
		queryKey: string;
		containedIn: readonly string[];
		supersededAtMs: number;
	}) => Promise<boolean>;
};
// The lane READER is deliberately NOT a member of this port, even though the sweep needs
// one. Both fetchers already declare their own `readLocalLaneCoverage`, and the orders one
// returns MORE than a browse window cares about (#954's `rangedResume`). Intersecting this
// port into those repository types would put two signatures on the same property, and TypeScript
// resolves the call against the first — silently narrowing the orders reader back to the
// browse-window shape and erasing `rangedResume` from every OTHER caller's view of it. The
// sweep takes the reader as an argument instead, so this port only declares what is unique
// to eviction.

/**
 * Delete the lanes the window `triggerQueryKey` just completed has superseded.
 *
 * ## Races this survives, and how
 *
 * **A Clear & Sync or ledger rebuild lands between the write and the sweep.**
 * `registerCursorInvalidator` bulk-removes the collection's lanes; a rebuild drops
 * `coverageLanes` outright. The sweep re-reads the SURVIVOR through the lane reader
 * immediately before deleting and abandons the pass if it is gone, went incomplete, or lost
 * ids — the same ancestry check the continuation makes, for the same reason. Without it the
 * sweep could delete a post-wipe lane on the authority of a pre-wipe survivor that no longer
 * exists. (That would still only cost a re-walk, but a sweep that acts on a survivor it can
 * no longer see is not one anyone can reason about.)
 *
 * **A smaller window's walk writes its lane between the plan and the delete.** The delete is
 * a compare-and-delete on the CURRENT revision: `removeCoverageLaneIfContained` re-evaluates
 * BOTH conditions inside the storage layer's read-modify-write. A lane that grew into
 * something the survivor does not contain survives. So does a lane written AFTER the
 * survivor — eviction is a claim about stale knowledge, and a rewrite is not stale, so the
 * sweep cannot delete a lane a live walk just produced and something is therefore demanding.
 * Without that second condition the re-written lane looks identical to the one that was
 * planned for deletion (same window, same ids) and would be deleted out from under its own
 * pass, dropping the grid's footer to the local count for no reason.
 *
 * **A smaller window's walk writes its lane AFTER the delete** (resurrection). Not prevented
 * — deliberately. See the module docblock: preventing it would mean evicting on every write,
 * which turns a grid parked below its deepest window into a fetch loop. One window's worth
 * of ids per concurrently in-flight smaller walk survives until the next growth step or
 * expiry collects it.
 *
 * **The survivor evicts itself.** Cannot happen: only strictly smaller limits are planned.
 */
export async function evictSupersededBrowseWindowLanes(input: {
	collection: string;
	triggerQueryKey: string;
	identify: BrowseWindowLaneIdentifier;
	repository?: BrowseWindowLaneEvictionRepository | undefined;
	/** The survivor re-read at delete time; see the ancestry note above. */
	readLane?: BrowseWindowLaneReader | undefined;
	nowMs: number;
	diagnostics?: SyncObserver | undefined;
}): Promise<string[]> {
	const repository = input.repository;
	if (!repository?.listCoverageLanes || !repository.removeCoverageLaneIfContained) return [];
	// Cheap rejection before touching storage: most lane writes are not browse windows.
	if (!input.identify(input.triggerQueryKey)) return [];

	const lanes = await repository.listCoverageLanes(input.collection);
	const evictions = planBrowseWindowLaneEviction({
		lanes,
		triggerQueryKey: input.triggerQueryKey,
		identify: input.identify,
	});
	if (evictions.length === 0) return [];

	const survivor = lanes.find((lane) => lane.queryKey === input.triggerQueryKey)!;
	const survivorLimit = input.identify(input.triggerQueryKey)!.limit;
	if (!(await survivorStillHolds(input, input.readLane, survivor, survivorLimit))) {
		input.diagnostics?.({
			type: 'browse-window.eviction-skipped',
			level: 'warn',
			collection: input.collection,
			message: `Skipped evicting ${evictions.length} superseded ${input.collection} browse-window lane(s): ${input.triggerQueryKey} no longer holds the coverage they were superseded by`,
		});
		return [];
	}

	const evicted: string[] = [];
	for (const eviction of evictions) {
		const removed = await repository.removeCoverageLaneIfContained({
			collection: input.collection,
			queryKey: eviction.queryKey,
			containedIn: survivor.expectedRecordIds,
			supersededAtMs: survivor.updatedAtMs,
		});
		if (removed) evicted.push(eviction.queryKey);
	}

	if (evicted.length > 0) {
		input.diagnostics?.({
			type: 'browse-window.lanes-evicted',
			level: 'debug',
			collection: input.collection,
			message: `Evicted ${evicted.length} superseded ${input.collection} browse-window lane(s) covered by ${input.triggerQueryKey}: ${evicted.join(', ')}`,
		});
	}
	return evicted;
}

/**
 * Re-read the survivor at delete time. A survivor that vanished, went unsettled, or lost ids
 * is no longer authority to delete anything on this pass.
 */
async function survivorStillHolds(
	input: { collection: string; nowMs: number },
	readLane: BrowseWindowLaneReader | undefined,
	planned: BrowseWindowLaneSnapshot,
	limit: number
): Promise<boolean> {
	if (!readLane) return true;
	const current = await readLane(input.collection, planned.queryKey, input.nowMs);
	if (!current) return false;
	const currentIds = current.expectedRecordIds ?? [];
	if (
		!isSettledBrowseWindowLane({ complete: current.complete, expectedRecordIds: currentIds }, limit)
	) {
		return false;
	}
	const currentIdSet = new Set(currentIds);
	return planned.expectedRecordIds.every((id) => currentIdSet.has(id));
}
