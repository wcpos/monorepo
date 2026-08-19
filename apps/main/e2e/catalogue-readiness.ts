/**
 * Catalogue readiness for restored sessions — why this exists.
 *
 * The restored-state path used to wait up to 60s for a product tile and then
 * SWALLOW the result (`.catch(() => {})`), so a POS that renders no products at
 * all was indistinguishable from a healthy one: nothing failed, every
 * authenticated test simply paid a silent 60s tax. On 2026-08-19 that turned a
 * real app regression into "CI is slow" — shards ballooned from ~12min to
 * 32-60min, hit the job timeout, and reported as flaky infrastructure for most
 * of a day. Flat, identical per-test durations were the only tell.
 *
 * Two rules follow, and this module exists to keep them honest:
 *
 *  1. **Use the evidence the OAuth path already trusts.** That path asserts on
 *     `data-table-count` containing a non-zero digit. A restored session is
 *     ready by exactly the same standard — no separate tile-shaped guess that
 *     can drift (the previous marker missed variable-product tiles entirely and
 *     burned its whole timeout on a Luma catalogue).
 *  2. **Diagnose once per worker, not once per test.** A catalogue that never
 *     renders is a RUN-level condition. The first test pays the timeout and
 *     records why; the rest fail instantly with the same reason instead of each
 *     re-paying it. One clear failure beats N slow identical ones.
 *
 * Deliberately NOT changed: a cold-start profile still opts out via
 * `waitForCatalogue: false`, and an empty store is still the OAuth path's call
 * to make — this module only reports what it observed.
 */

/**
 * Bounded because it is a health check, not a sync budget: a healthy restore
 * renders in ~2s (measured 2026-08-18). The OAuth path keeps its own longer
 * ceiling for a genuine first sync; this one only has to notice that a restored
 * session is unusable, and noticing quickly is the entire point.
 */
export const CATALOGUE_READY_TIMEOUT_MS = 20_000;

/** What the count element showed when the wait ran out. */
export type CatalogueObservation = {
	/** `data-table-count`'s text, or null when the element never appeared. */
	countText: string | null;
	elapsedMs: number;
};

/**
 * The message a failed readiness wait should carry. Written to be actionable in
 * a CI log with no other context: it names the signal, what it showed, and the
 * two causes worth checking, so nobody has to infer a regression from timings.
 */
export function catalogueUnavailableMessage(observation: CatalogueObservation): string {
	const observed =
		observation.countText === null
			? 'the data-table-count element never rendered'
			: `data-table-count showed "${observation.countText}"`;
	return (
		`Restored session never produced a non-empty catalogue after ${observation.elapsedMs}ms — ${observed}. ` +
		`Either the store genuinely has no products, or the app failed to render them ` +
		`(a product-demand regression looks exactly like this). Falling back to OAuth, which asserts the same signal.`
	);
}

/**
 * Per-worker memo of a run-level catalogue failure. Playwright workers are
 * separate processes, so this is naturally scoped to one worker: each pays the
 * diagnosis once, then short-circuits.
 */
let catalogueUnavailable: string | null = null;

export function recordCatalogueUnavailable(reason: string): void {
	catalogueUnavailable ??= reason;
}

export function catalogueUnavailableReason(): string | null {
	return catalogueUnavailable;
}

/** Test-only: the memo is module state, so suites that assert on it must reset. */
export function resetCatalogueUnavailable(): void {
	catalogueUnavailable = null;
}
