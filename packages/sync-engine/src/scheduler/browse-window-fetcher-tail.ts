/**
 * THE TAIL EVERY CONTINUATION-BASED BROWSE WALK RUNS.
 *
 * The orders and products fetchers walk very different wires — one cursors by date and
 * carries a ranged Reports mode, the other resolves a menu_order/id tiebreak past the
 * window's boundary — but once the rows are persisted they did the SAME seven things, in
 * the same order, in two near-verbatim copies (down to a word-for-word "#1030 residual"
 * comment on the demotion argument). That sequence is here, once:
 *
 *  1. report a walk cut short by the per-drain page budget;
 *  2. re-read the lane the continuation took its prefix from (the ancestry guard);
 *  3. on a lost prefix, DEMOTE — keep the rows' record coverage, withdraw the window claim,
 *     and report `browse-window.prefix-invalidated`;
 *  4. union the carried prefix with this drain's delta;
 *  5. decide whether the window was actually FILLED (never claim a window you did not fill);
 *  6. write the lane — with the prefix ancestry re-checked INSIDE the write; and
 *  7. STRICTLY AFTER that write, evict the smaller lanes this window supersedes.
 *
 * The two lanes' remaining differences are DATA, not shape, and each is named as a field
 * below rather than being smoothed away: the orders lane refuses to call a window complete
 * unless the SERVER ran out, the products lane skips its write entirely when a resumed walk
 * did not move past its prefix, and the two emit the page-budget warning on opposite sides
 * of the ancestry check. All three are behaviour their tests pin.
 *
 * Customers deliberately does NOT run this tail: its windows double rather than step, so a
 * predecessor is not a page-aligned prefix of its successor and there is nothing to continue
 * from or supersede. See CUSTOMER_BROWSE_WINDOW_GRAMMAR.
 */

import type { SyncObserver } from '@wcpos/sync-core';

import {
	type BrowseWindowContinuation,
	type BrowseWindowLaneReader,
	browseWindowPrefixSurvived,
	mergeBrowseWindowRecordIds,
} from './browse-window-continuation';
import {
	type BrowseWindowLaneEvictionRepository,
	evictSupersededBrowseWindowLanes,
} from './browse-window-lane-eviction';

import type { BrowseWindowLaneIdentifier } from './browse-window-grammar';
import type { BuildCoverageDocumentsFromQueryResultInput } from './query-coverage-writes';

type PrefixAncestry = BuildCoverageDocumentsFromQueryResultInput['prefixAncestry'];

/**
 * The two coverage writes this tail performs, supplied by the fetcher because orders and
 * products reach coverage through different helpers (the orders one also feeds the ranged
 * cursor). Deliberately two adapters and no port — the same seam
 * {@link BrowseWindowLaneIdentifier} uses.
 */
export type BrowseWindowTailWriter = {
	/** Record rows WITHOUT claiming a window for them (the demotion path). */
	recordRecordsOnly: (recordIds: string[]) => Promise<void>;
	/**
	 * Write the window's coverage lane. ABSENT means this pass writes no lane at all — a
	 * search-scoped orders window, whose coverage goes to records only, so it has nothing to
	 * supersede with and nothing a later pass could resume from.
	 */
	recordLane?:
		| ((input: {
				recordIds: string[];
				complete: boolean;
				prefixAncestry: PrefixAncestry;
		  }) => Promise<void>)
		| undefined;
};

export type BrowseWindowTailOutcome = {
	/**
	 * Whether this pass moved the window past what it already held. A pass that DEMOTED (lost
	 * its carried prefix mid-walk) reports `true`: the window restarts from the top next pass
	 * regardless, so the caller must not send it round again in this one.
	 */
	progressed: boolean;
};

export type FinalizeBrowseWindowLaneInput = {
	collection: string;
	/** The lane key this pass is filling — `task.queryKey`. */
	queryKey: string;
	/** The window's own size, in records. */
	windowLimit: number;
	continuation: BrowseWindowContinuation;
	/** Coverage ids this drain fetched, in wire order. */
	deltaRecordIds: string[];
	/** The server ran out of matching records before the window filled. */
	serverExhausted: boolean;
	/** The per-drain page budget bit before the window filled. */
	truncatedByPageBudget: boolean;
	/**
	 * False when the server ignored a POS dimension it was asked to filter by (products'
	 * `brand`, orders' `pos_cashier`/`pos_store`). The rows are kept — they are real — but the
	 * lane claims NO coverage for them, because `complete:false` alone would not stop the
	 * serve-local gate answering a filtered window from unfiltered rows.
	 */
	dimensionsHonored: boolean;
	/**
	 * Orders only: a window counts as complete only if the SERVER ran out. A products window
	 * that filled to its own size is complete even with more catalogue behind it.
	 */
	requireServerExhaustedForComplete: boolean;
	/**
	 * Products only: skip the lane write when a resumed walk re-fetched nothing new, rather
	 * than leaving a spurious short lane for the full re-walk to overwrite a moment later.
	 */
	skipLaneWriteWithoutProgress: boolean;
	pageBudget: {
		/** The warning text; the fetcher owns the wording because it owns the page counts. */
		message: string;
		/** Orders warns before the ancestry check, products after it. Pinned either way. */
		emitBeforeAncestryCheck: boolean;
	};
	/** Warning text for a prefix lost mid-walk. */
	prefixInvalidatedMessage: string;
	identify: BrowseWindowLaneIdentifier;
	evictionRepository?: BrowseWindowLaneEvictionRepository | undefined;
	readLane?: BrowseWindowLaneReader | undefined;
	nowMs: number;
	diagnostics?: SyncObserver | undefined;
	writer: BrowseWindowTailWriter;
};

export async function finalizeBrowseWindowLane(
	input: FinalizeBrowseWindowLaneInput
): Promise<BrowseWindowTailOutcome> {
	const { continuation, writer } = input;
	const covered = continuation.covered;

	const emitPageBudget = (): void => {
		if (!input.truncatedByPageBudget) return;
		input.diagnostics?.({
			type: 'browse-window.page-budget-reached',
			level: 'warn',
			collection: input.collection,
			message: input.pageBudget.message,
		});
	};

	if (input.pageBudget.emitBeforeAncestryCheck) emitPageBudget();

	// Ancestry guard (#1023's pattern): only assert the carried prefix if the lane it came
	// from still holds exactly it. A Clear & Sync or ledger rebuild landing mid-walk would
	// otherwise resurrect coverage for records it just deleted.
	const prefixSurvived = await browseWindowPrefixSurvived({
		collection: input.collection,
		continuation,
		nowMs: input.nowMs,
		readLane: input.readLane,
	});
	if (!prefixSurvived) {
		input.diagnostics?.({
			type: 'browse-window.prefix-invalidated',
			level: 'warn',
			collection: input.collection,
			message: input.prefixInvalidatedMessage,
		});
		// The lane claims NOTHING, not even this pass's rows: the walk resumed at an offset, so
		// what it holds is a TAIL of the listing, and readBrowseWindowContinuation would read a
		// page-aligned incomplete lane as the LEADING prefix — storing the tail would make the
		// next pass offset past rows nobody fetched and splice the window permanently. The rows
		// are real and already resident, so their RECORD coverage stands; only the window claim
		// is withdrawn.
		await writer.recordRecordsOnly(input.deltaRecordIds);
		await writer.recordLane?.({ recordIds: [], complete: false, prefixAncestry: undefined });
		// The prefix is gone, so the next pass must re-walk from the top regardless; do not send
		// the caller round again in this one.
		return { progressed: true };
	}

	if (!input.pageBudget.emitBeforeAncestryCheck) emitPageBudget();

	// The lane records the WHOLE window — the covered prefix unioned with this drain's delta —
	// not just what travelled the wire. The grid's footer total reads
	// `expectedRecordIds.length` for exactly this key (projectTotal), so a delta-only lane
	// would make a grown window report the size of its last growth step.
	const laneRecordIds = mergeBrowseWindowRecordIds(continuation.recordIds, input.deltaRecordIds);
	// NEVER claim a window you did not actually fill. A resumed delta can re-deliver records
	// the prefix already holds (products' phase-2 tiebreak substitutes rows from later wire
	// pages; an order created between two growth steps shifts the listing under the offset);
	// the merge dedupes them and the lane comes back SHORT. Recording that as complete would
	// freeze the window with a hole in it AND let the serve-local gate answer from it.
	const filledTheWindow = input.serverExhausted || laneRecordIds.length >= input.windowLimit;
	// Did this walk move the window past what it already had? A resumed walk that re-fetched
	// only ids the prefix already held has not.
	const progressed = laneRecordIds.length > covered || input.serverExhausted;
	if (input.skipLaneWriteWithoutProgress && !progressed) {
		return { progressed: false };
	}

	if (!writer.recordLane) {
		await writer.recordRecordsOnly(laneRecordIds);
		return { progressed: true };
	}

	await writer.recordLane({
		recordIds: input.dimensionsHonored ? laneRecordIds : [],
		complete:
			input.dimensionsHonored &&
			!input.truncatedByPageBudget &&
			filledTheWindow &&
			(!input.requireServerExhaustedForComplete || input.serverExhausted),
		// Re-check the carried prefix INSIDE the write. The guard above runs before the walk,
		// but `withLedgerRecovery` replays this write verbatim after a rebuild drops
		// `coverageLanes` — the one window that guard cannot close (#1030 residual).
		prefixAncestry:
			covered > 0 && continuation.sourceQueryKey
				? {
						sourceQueryKey: continuation.sourceQueryKey,
						recordIds: continuation.recordIds,
						// Same dimension gate as the primary write above: a superset from a server that
						// ignored the filter must not be recorded as coverage through the demotion path.
						fallbackRecordIds: input.dimensionsHonored ? input.deltaRecordIds : [],
					}
				: undefined,
	});
	// STRICTLY AFTER the write. The smaller lanes this window supersedes include the one the
	// continuation resumed from, and the ancestry guard above re-reads exactly that lane —
	// evicting before the write would make the pass demote itself to an incomplete delta.
	await evictSupersededBrowseWindowLanes({
		collection: input.collection,
		triggerQueryKey: input.queryKey,
		identify: input.identify,
		repository: input.evictionRepository,
		readLane: input.readLane,
		nowMs: input.nowMs,
		diagnostics: input.diagnostics,
	});

	return { progressed: true };
}
