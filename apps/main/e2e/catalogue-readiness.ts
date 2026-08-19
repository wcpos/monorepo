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
 * The rule that follows: **use the evidence the OAuth path already trusts.**
 * That path asserts `data-table-count` contains a non-zero digit. A restored
 * session is ready by exactly the same standard — no separate tile-shaped guess
 * that can drift from it (the previous marker missed variable-product tiles
 * entirely and burned its whole timeout on a Luma catalogue).
 *
 * Run-level fast-fail is deliberately NOT implemented here. `globalSetup`
 * authenticates with `waitForCatalogue` before any test runs and asserts the
 * same signal, so a catalogue that never renders aborts the whole run there,
 * once, with the message below. A per-worker memo was tried and removed: on
 * failure Playwright replaces the worker process, so module state does not
 * survive to help the tests that follow (review on #1336).
 *
 * Also deliberately unchanged: a cold-start profile still opts out via
 * `waitForCatalogue: false`, and whether an empty store is legitimate stays the
 * caller's judgement — this module only reports what it observed.
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
 *
 * Says nothing about what the caller does next — this same text is thrown from
 * the restored path (which falls back to OAuth) and from the OAuth path itself
 * (which has nothing left to fall back to), so any "falling back" claim here
 * would be false half the time (review on #1336).
 */
export function catalogueUnavailableMessage(observation: CatalogueObservation): string {
	const observed =
		observation.countText === null
			? 'the data-table-count element never rendered'
			: `data-table-count showed "${observation.countText}"`;
	return (
		`Catalogue never became non-empty after ${observation.elapsedMs}ms — ${observed}. ` +
		`Either the store genuinely has no products, or the app failed to render them ` +
		`(a product-demand regression looks exactly like this).`
	);
}
