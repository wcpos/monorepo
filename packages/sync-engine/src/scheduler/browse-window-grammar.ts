/**
 * ONE BROWSE-WINDOW GRAMMAR, THREE LANES.
 *
 * A browse window is a bounded, seeded result window over the servable set of one
 * collection: "the rows the grid is currently showing, expressed as a lane identity".
 * Orders, products and customers each have one, and each used to spell the same four
 * layers out in full — a descriptor module, a seeder, a fetcher tail, and a require-plane
 * branch. The layers agreed only by inspection: the orders seeder re-encoded the lane key
 * the demand plane had already built and asserted the two matched at runtime, which is a
 * duplication with a smoke alarm attached rather than one encoder.
 *
 * This module is the encoder. What differs between the three lanes is DATA — a
 * {@link BrowseWindowGrammar} value each collection declares — and what is shared is the
 * engine over it: lane identity for eviction, the schema-ceiling refusals, the seeding
 * shape (rx-browse-window-lane-seeder.ts) and the fetcher tail
 * (browse-window-fetcher-tail.ts).
 *
 * Adding a browse-window lane is a descriptor, not a copy — the same rule
 * rx-targeted-lane-seeder.ts states for targeted-id lanes.
 *
 * ## The one invariant every member of this type owes
 *
 * `encode` and `parse` are MUTUALLY INVERSE over the encoder's whole domain, and `encode`
 * refuses (or normalizes away) anything `parse` rejects. This is not tidiness: a lane key
 * is a PERSISTED IDENTITY. It is stored in `schedulerTaskStates` and `coverageLanes` and
 * re-read on the next launch, so a key one half can express and the other drops seeds a
 * task the drain permanently refuses, or forks one window into two coverage lanes.
 * `browse-window-grammar.test.ts` holds both halves of that contract against all three
 * grammars, plus a byte-for-byte pin of the current key strings.
 */

import { schedulerTaskStateSchema } from './scheduler-task-state-schema';

/** Persisted ceiling on a scheduler task's `queryKey` (and, by construction, its id). */
export const SCHEDULER_TASK_KEY_MAX_LENGTH = schedulerTaskStateSchema.properties.queryKey.maxLength;
/** Persisted ceiling on a scheduler task's `requirementId`. */
export const SCHEDULER_REQUIREMENT_ID_MAX_LENGTH =
	schedulerTaskStateSchema.properties.requirementId.maxLength;

/** A browse-window lane key split into "which view" and "how deep". */
export type BrowseWindowLaneIdentity = {
	/** Canonical identity of the view: every dimension EXCEPT the window size. */
	viewKey: string;
	/** The window size the lane describes. */
	limit: number;
};

/** Maps a lane's queryKey to its view/limit identity; null when it is not a browse window. */
export type BrowseWindowLaneIdentifier = (queryKey: string) => BrowseWindowLaneIdentity | null;

/**
 * Everything that distinguishes one collection's browse window from another's.
 *
 * `TWindow` is the lane's own descriptor shape — the parse output and the encode input, so
 * the mutual-inverse contract above is expressible in the type.
 */
export type BrowseWindowGrammar<TWindow> = {
	/** Collection the lane's tasks and coverage belong to. */
	collection: string;
	/** The ENCODER half: descriptor → the persisted lane key. */
	encode: (window: TWindow) => string;
	/** The PARSER half: lane key → descriptor, or null when the key is not this lane's. */
	parse: (queryKey: string) => TWindow | null;
	/** The window size, or `'all'` for a ranged fetch-to-completion lane (orders/Reports). */
	limitOf: (window: TWindow) => number | 'all';
	/** The persisted requirement identity for this window. */
	requirementId: (window: TWindow) => string;
	/**
	 * The view identity — the key with the window size REMOVED — or null when the lane is not
	 * a scroll window and so can neither supersede nor be superseded (orders' `limit=all`).
	 *
	 * Always produced by re-encoding through this grammar rather than by string surgery on the
	 * key, so a dimension the encoder can express but a hand-rolled strip could not cannot
	 * collapse two views into one and evict across filters.
	 */
	viewKey: (window: TWindow) => string | null;
	/** Prefix of every schema-ceiling refusal this lane's seeder raises. */
	schemaCeilingLabel: string;
	/**
	 * Whether the ceiling is measured against the seeded TASK id (`<queryKey>:windowed`)
	 * rather than the queryKey alone. A per-lane quirk, pinned rather than unified: changing
	 * which string is measured would change which windows a store can seed.
	 */
	measureTaskIdAgainstCeiling: boolean;
};

/** `:name=value`, or `''` when the dimension is absent. The one spelling of a key field. */
export function browseWindowKeyPart(name: string, value: number | string | undefined): string {
	return value === undefined ? '' : `:${name}=${value}`;
}

/**
 * The eviction seam's {@link BrowseWindowLaneIdentifier} for a grammar — one function
 * instead of the per-collection identity each lane used to hand-roll.
 *
 * ONLY CANONICAL KEYS GET AN IDENTITY. A key that parses but is not the key this encoder
 * would have written — `:limit=0050`, `:customer=007` — is refused rather than grouped into
 * the canonical view. Eviction DELETES lanes, so the cost of grouping two spellings that
 * some other writer may treat as distinct is asymmetric: the lane a non-canonical key names
 * would be deleted on the authority of a survivor that is not, strictly, the same view. The
 * orders identity used to state this as an `endsWith(':limit=<N>')` check; re-encoding is
 * the general form of the same guard, and it covers every dimension rather than the limit
 * alone.
 */
export function browseWindowLaneIdentity<TWindow>(
	grammar: BrowseWindowGrammar<TWindow>
): BrowseWindowLaneIdentifier {
	return (queryKey) => {
		const window = grammar.parse(queryKey);
		if (!window) return null;
		const limit = grammar.limitOf(window);
		if (limit === 'all') return null;
		if (grammar.encode(window) !== queryKey) return null;
		const viewKey = grammar.viewKey(window);
		return viewKey === null ? null : { viewKey, limit };
	};
}

/**
 * Refuse a lane identity the persisted schema cannot hold.
 *
 * Filter id lists and free search text make these keys input-dependent, so a key over the
 * ceiling is reachable from the UI. Left unchecked it fails deep inside RxDB validation;
 * `require()` rejections are swallowed by declareRequirements, so refusing here degrades to
 * no remote demand rather than breaking the grid.
 */
export function assertBrowseWindowKeyLengths<TWindow>(
	grammar: BrowseWindowGrammar<TWindow>,
	input: { queryKey: string; taskId: string; requirementId: string }
): void {
	const measured = grammar.measureTaskIdAgainstCeiling ? input.taskId : input.queryKey;
	if (measured.length > SCHEDULER_TASK_KEY_MAX_LENGTH) {
		throw new Error(
			`${grammar.schemaCeilingLabel} queryKey exceeds schema limit: ${input.queryKey.length} > ${SCHEDULER_TASK_KEY_MAX_LENGTH}`
		);
	}
	if (input.requirementId.length > SCHEDULER_REQUIREMENT_ID_MAX_LENGTH) {
		throw new Error(
			`${grammar.schemaCeilingLabel} requirementId exceeds schema limit: ${input.requirementId.length} > ${SCHEDULER_REQUIREMENT_ID_MAX_LENGTH}`
		);
	}
}
