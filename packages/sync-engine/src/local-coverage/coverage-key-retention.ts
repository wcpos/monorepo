/**
 * RECORD-SIDE COVERAGE KEYS ARE PRUNED AT WRITE TIME, NOT ACCUMULATED FOREVER (#1034).
 *
 * ## The growth
 *
 * Every coverage RECORD carries `coveredQueryKeys` — the lanes that assert it — and
 * `mergeRecord` unions that array on every write, permanently. Browse windows mint one lane
 * per growth step (`limit=100, 200, 300 …`), and each step's write re-stamps EVERY record in
 * the window, so a record near the head of a catalogue collects one membership per window
 * that ever contained it.
 *
 * Scrolling a products grid to 10,000 rows in 100-row steps leaves
 * `Σ(1..100) × 100 = 505,000` memberships across 10,000 records — quadratic in scroll depth,
 * in queryKey strings that are LONGER than the coverage ids #1032 removed from the lane side.
 * #1032 bounded `coverageLanes`; this is the other half, and the larger one.
 *
 * ## What this is, and is not
 *
 * Be honest about the stakes: `coveredQueryKeys` currently has **no production reader**. The
 * public record shape (`LocalRecordCoverage`) exposes `collection`, `id` and `fresh` only,
 * retention keys off `freshUntilMs`, and nothing in the engine, query layer, or app reads
 * the array back. So this is a STORAGE fix, not a correctness fix — no user-visible decision
 * is wrong today because of the stale keys.
 *
 * That is also why the prune is shaped as a retention rule rather than a deletion: if a
 * reader ever appears, "the lanes that still assert this record" is the answer it would
 * want, and a stale key was never a meaningful answer to anything.
 *
 * ## The rule
 *
 * A key is dropped only when BOTH hold:
 *
 *  1. it is a BROWSE-WINDOW lane key — products, orders (unsearched), or customers; and
 *  2. no lane document for it exists any more.
 *
 * Condition 1 is what makes this safe. Several write paths stamp keys onto records that
 * NEVER have a lane document at all — most importantly the orders SEARCH window, whose
 * coverage goes through `recordRecords` (records only, `lanes: []`). Pruning "any key
 * without a lane" would delete those on the very next write. Restricting to the browse-window
 * grammars targets exactly the keys that (a) are minted unboundedly and (b) always have a
 * lane while they are live, so absence is real evidence of supersession rather than evidence
 * that this lane family never writes lanes.
 *
 * ## Why write time, and why no separate sweep
 *
 * Pruning inside #1032's eviction sweep was measured and rejected: evicting the 3,900-row
 * lane at the 4,000 tick would rewrite 3,900 record documents, making the WORK quadratic in
 * order to stop the STORAGE being quadratic.
 *
 * At write time it is free. The browse-window write already re-stamps every record in the
 * window on every tick (`recordCoverage` passes the whole window, not the delta), so the
 * documents are being rewritten anyway — the prune rides along on writes that already
 * happen and adds no extra ones. One lane-key lookup per write BATCH, not per record.
 *
 * A record that stops being covered is never rewritten, so it keeps its stale keys — and
 * needs no sweep to fix it, because record retention already deletes the whole document once
 * `freshUntilMs` passes (`planPersistedCoverageRetention` treats records exactly like lanes).
 * Expiry is the safety net, and it collects the document rather than tidying it.
 *
 * ## The bound this actually delivers
 *
 * Two keys per record, not one — and constant, which is the point. #1032 evicts a superseded
 * lane AFTER the write that filled the deeper window (its ancestry guard has to re-read the
 * lane the walk resumed from), so at the moment a tick stamps its records the PREDECESSOR
 * window's lane is still live and is legitimately retained. It is evicted a moment later and
 * dropped by the next write that touches those records. A record therefore rests holding the
 * current window and the one before it: O(1) instead of O(depth/step).
 *
 * Measured on a 10,000-row scroll in 100-row steps: 505,000 memberships (17.34 MB of key
 * strings) → 19,900 (0.69 MB), a 96% reduction, with the per-record peak going from 100 keys
 * to 2. `ledger-storage-recovery.test.ts` replays a 500-row scroll through real storage and
 * pins the 900 that arithmetic predicts.
 *
 * ## One interaction worth naming: the compaction CAS
 *
 * `removeRecordIfUnchanged` decides "has this document changed since compaction planned its
 * removal?" by comparing the whole record, `coveredQueryKeys` included. A prune that lands
 * between the plan and the delete therefore makes that pass skip the removal. This is not
 * new — any concurrent write already moves `updatedAtMs` and fails the same guard — and the
 * failure direction is the safe one: a deletion is deferred to the next compaction pass,
 * never applied to a document it no longer describes.
 */

// Through the scheduler's index, not into its files — the package seam this repo enforces.
import {
	parseCustomerBrowseWindowDescriptor,
	parseOrderBrowserSchedulerDescriptor,
	parseProductBrowseWindowDescriptor,
} from '../scheduler';

/**
 * Whether a coverage key belongs to a browse-window lane family — the only keys this module
 * will drop, and only then when their lane is gone.
 *
 * Two orders keys parse as descriptors but are deliberately excluded:
 *
 *  - the SEARCH window, because that path records coverage through `recordRecords`, which
 *    writes no lane — its keys are absent BY DESIGN rather than superseded; and
 *  - the RANGED fetch-to-completion lane (`limit=all`, Reports), which is not a scroll
 *    window at all: one per date range rather than one per growth step, so it does not grow
 *    with scrolling and has no supersession relation to reason about.
 *
 * Baseline markers (`…:baseline-in-progress:<taskId>`) and the targeted/search keys of every
 * other family do not parse as browse windows at all.
 */
export function isBrowseWindowCoverageKey(queryKey: string): boolean {
	if (parseProductBrowseWindowDescriptor(queryKey) !== null) return true;
	if (parseCustomerBrowseWindowDescriptor(queryKey) !== null) return true;
	const orders = parseOrderBrowserSchedulerDescriptor(queryKey)?.descriptor;
	// `complete` on an orders descriptor means `limit=all`, not "the walk finished".
	return orders !== undefined && orders.search === '' && !orders.complete;
}

/**
 * The keys a record should keep. Pure — the caller supplies which lanes are live, so this
 * never touches storage and the whole rule is testable without a database.
 *
 * `liveLaneKeys` must include the lanes being written in the SAME batch as this record:
 * `writeCoverageDocumentsWithMerge` writes records before lanes, so a window's own lane does
 * not exist yet at the moment its records are stamped, and omitting it would prune the key
 * the write is currently asserting.
 */
export function retainedCoverageQueryKeys(
	keys: readonly string[],
	liveLaneKeys: ReadonlySet<string>
): string[] {
	return keys.filter((key) => liveLaneKeys.has(key) || !isBrowseWindowCoverageKey(key));
}
