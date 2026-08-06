/**
 * BROWSE WINDOWS PAGE INDEFINITELY (#948, #957).
 *
 * Paul's ruling, 2026-08-06: “Having lists stop at an arbitrary number is totally
 * unacceptable. If a cashier wants to scroll past 200 orders, they better be allowed to
 * scroll past 200 orders.” The products window used to refuse past 1,000 rows and the
 * orders window past 200 — and the refusal was worse than a refusal, because it was
 * expressed as a CLAMP on the limit that travels in the lane key. Every `extendLimit`
 * past the ceiling minted the IDENTICAL query key, the scheduler deduped it as work it
 * had already done, and the grid silently dead-ended. 1.9 paged both lists forever.
 *
 * The ceilings are gone. What replaces them is not a bigger number but a different
 * mechanic — CONTINUATION:
 *
 *  - The window's limit still travels in the key, so limit=200 and limit=300 are DISTINCT
 *    lanes and distinct scheduler tasks. Nothing dedupes them away.
 *  - Growing a window does NOT re-download it. Before walking, the fetcher asks coverage
 *    what it already holds for this window (or for the window one step smaller — the lane
 *    the previous scroll tick wrote) and resumes the walk at that record offset, unioning
 *    the covered prefix's ids into the grown lane. Growing 200 → 300 costs one page, not
 *    three, and the cost of one scroll tick is therefore CONSTANT no matter how deep the
 *    cashier has scrolled. That is what keeps per-request work bounded now that the
 *    window itself is not.
 *  - The offset is denominated in RECORDS, not pages, so a Performance-dial change
 *    between two growth steps cannot corrupt the page arithmetic.
 *
 * The remaining ceiling, {@link BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT}, is a runaway backstop,
 * not a product limit: it is two orders of magnitude past anything a human reaches by
 * scrolling, and hitting it is reported (`browse-window.backstop-reached`) rather than
 * swallowed.
 */

/**
 * Absolute runaway backstop for any browse window's limit, both lanes.
 *
 * NOT a cashier-reachable number: a grid extends its limit one UI page (10 rows) at a
 * time, so reaching this takes ten thousand scroll ticks. It exists so a corrupted or
 * synthesised limit (an overflowed arithmetic result, a `Number.MAX_SAFE_INTEGER`
 * sentinel that leaked out of the Reports path) cannot become a window, and so the
 * key grammar has a finite domain. Reaching it is NON-SILENT: the seeder emits
 * `browse-window.backstop-reached` and the window — hence the grid's footer count —
 * stops growing visibly rather than quietly.
 */
export const BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT = 100_000;

/**
 * Pages one drain will walk for a single browse window past whatever it already covers.
 * A growth step costs one or two pages, so this only ever bites a COLD walk of a window
 * that is already enormous (the lane expired while the grid sat at 10,000 rows). Such a
 * walk records incomplete coverage and the next drain resumes from the prefix it left,
 * instead of one tick issuing a hundred requests.
 */
export const BROWSE_WINDOW_MAX_PAGES_PER_DRAIN = 50;

/** Whether a limit is a usable browse-window size (positive, integral, under the backstop). */
export function isBrowseWindowLimit(limit: number): boolean {
	return Number.isSafeInteger(limit) && limit > 0 && limit <= BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT;
}

/** Clamp a requested window size to the runaway backstop. */
export function clampToBrowseWindowBackstop(limit: number): number {
	return Math.min(limit, BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT);
}

export type BrowseWindowLaneCoverage = {
	complete: boolean;
	fresh: boolean;
	expectedRecordIds?: string[];
};

/**
 * The coverage read the continuation needs. Structurally the engine's
 * `readLocalLaneCoverage` (LocalCoverage.readLane), so no new port is introduced — the
 * fetchers already receive it on their coverage repository.
 */
export type BrowseWindowLaneReader = (
	collection: string,
	queryKey: string,
	nowMs: number
) => Promise<BrowseWindowLaneCoverage | null>;

export type BrowseWindowContinuation = {
	/** The window is already covered and fresh — nothing to fetch this drain. */
	satisfied: boolean;
	/** Rows of the window already held, i.e. the record offset the walk resumes at. */
	covered: number;
	/** Coverage ids of the covered prefix, to union into the grown lane. */
	recordIds: string[];
	/** The lane the prefix was taken from — re-read at write time by the ancestry guard. */
	sourceQueryKey: string | null;
};

export const NO_BROWSE_WINDOW_CONTINUATION: BrowseWindowContinuation = {
	satisfied: false,
	covered: 0,
	recordIds: [],
	sourceQueryKey: null,
};

/**
 * Decide where a browse-window walk should start.
 *
 * Three lanes are consulted, in order:
 *
 *  1. **This window's own lane, fresh and settled** — settled meaning either COMPLETE
 *     (the server had nothing more) or already holding the window's full `limit` rows.
 *     Serve local: zero requests, and (deliberately) no coverage rewrite, so the lane
 *     still expires on its own schedule and the window does get re-walked periodically.
 *     Without this, the seeder's 30s completed-dedupe would re-fetch the window's tail
 *     twice a minute forever.
 *  2. **This window's own lane, fresh but short** — a previous drain was cut off by
 *     {@link BROWSE_WINDOW_MAX_PAGES_PER_DRAIN}. Resume where it stopped.
 *  3. **The predecessor window's lane (one growth step smaller), fresh and settled** —
 *     the ordinary scroll case. Resume at its length; the delta is one step's worth.
 *
 * The `complete` flag alone is NOT the test, because the two lanes mean different things
 * by it: a products window records complete for any honoured walk, while an orders window
 * records complete only when the server ran out of matching orders. "Filled to its own
 * limit" is the property that actually makes a prefix reusable, and it holds for both.
 *
 * `forceRefresh` (an explicit user-driven sync) skips all three: a refresh that resumed
 * from its own prefix would never see anything new.
 */
export async function readBrowseWindowContinuation(input: {
	collection: string;
	ownQueryKey: string;
	predecessorQueryKey: string | null;
	predecessorLimit: number;
	limit: number;
	nowMs: number;
	readLane?: BrowseWindowLaneReader | undefined;
	forceRefresh?: boolean | undefined;
}): Promise<BrowseWindowContinuation> {
	if (!input.readLane || input.forceRefresh) return NO_BROWSE_WINDOW_CONTINUATION;

	const own = await input.readLane(input.collection, input.ownQueryKey, input.nowMs);
	if (own?.fresh) {
		const held = own.expectedRecordIds?.length ?? 0;
		if (own.complete || held >= input.limit) {
			return {
				satisfied: true,
				covered: input.limit,
				recordIds: own.expectedRecordIds ?? [],
				sourceQueryKey: input.ownQueryKey,
			};
		}
		if (held > 0) {
			return continuationFrom(own.expectedRecordIds!, input.limit, input.ownQueryKey);
		}
	}
	if (!input.predecessorQueryKey) return NO_BROWSE_WINDOW_CONTINUATION;

	const predecessor = await input.readLane(
		input.collection,
		input.predecessorQueryKey,
		input.nowMs
	);
	if (!predecessor?.fresh) return NO_BROWSE_WINDOW_CONTINUATION;
	const held = predecessor.expectedRecordIds?.length ?? 0;
	if (!predecessor.complete && held < input.predecessorLimit) return NO_BROWSE_WINDOW_CONTINUATION;
	return continuationFrom(
		predecessor.expectedRecordIds ?? [],
		input.limit,
		input.predecessorQueryKey
	);
}

function continuationFrom(
	recordIds: string[],
	limit: number,
	sourceQueryKey: string
): BrowseWindowContinuation {
	// The prefix can only ever be trusted up to the window it is filling; a longer prefix
	// (a shrinking grid, a lane written under a different dial) truncates rather than
	// over-reporting coverage for this key.
	const prefix = recordIds.length > limit ? recordIds.slice(0, limit) : recordIds;
	return {
		satisfied: prefix.length >= limit,
		covered: prefix.length,
		recordIds: prefix,
		sourceQueryKey,
	};
}

/**
 * PREFIX ANCESTRY GUARD — the check that makes reading a prefix at pass start and writing
 * a grown lane at pass end safe (the pattern #1023 established for ranged report cursors,
 * adopted here for the same reason).
 *
 * Reading the prefix and writing the union are not atomic, and the lane can be removed
 * BETWEEN them: `registerCursorInvalidator` bulk-removes a collection's `coverageLanes`
 * rows on Clear & Sync, and a `schedulerTaskStates` ledger rebuild drops `coverageLanes`
 * entirely (#956/#959). Writing the union anyway would RESURRECT a lane asserting a
 * thousand covered records that the wipe just deleted — and because a browse lane's
 * `expectedRecordIds.length` IS the grid's footer total, and a complete+fresh lane is a
 * serve-local answer, the grid would report and believe coverage it does not have, with
 * nothing to correct it until the lane expired.
 *
 * So a pass may only assert its prefix if the lane it took that prefix from still holds
 * exactly it. Anything else — wiped mid-pass, or advanced by another writer — demotes the
 * write to the delta alone with `complete: false`, restarting the window from the top next
 * pass. Wasteful, always safe; the opposite trade is a grid lying about what it holds.
 */
export async function browseWindowPrefixSurvived(input: {
	collection: string;
	continuation: BrowseWindowContinuation;
	nowMs: number;
	readLane?: BrowseWindowLaneReader | undefined;
}): Promise<boolean> {
	const { continuation } = input;
	// Nothing was carried forward, so there is no ancestry to lose.
	if (continuation.covered === 0 || !continuation.sourceQueryKey || !input.readLane) return true;
	const lane = await input.readLane(input.collection, continuation.sourceQueryKey, input.nowMs);
	const stored = lane?.expectedRecordIds;
	if (!stored || stored.length < continuation.recordIds.length) return false;
	return continuation.recordIds.every((id, index) => stored[index] === id);
}

/** Union the covered prefix with a freshly fetched delta, first occurrence wins. */
export function mergeBrowseWindowRecordIds(
	prefix: readonly string[],
	delta: readonly string[]
): string[] {
	const seen = new Set(prefix);
	return [...prefix, ...delta.filter((id) => !seen.has(id) && (seen.add(id), true))];
}
