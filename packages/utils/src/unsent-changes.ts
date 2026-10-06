/**
 * "How much work on this device has never reached the server?" — the question
 * every destructive local-data path has to ask before it wipes anything.
 *
 * The durable mutation queue keeps one row per outbound change until the server
 * acknowledges it (`pending → claimed → acknowledged (row removed)`), so a
 * non-empty queue is, quite literally, work that exists nowhere else. For a
 * born-local order CREATE that row IS a completed sale. Clearing local data
 * destroys it with no server copy to fall back on, which is why both reset
 * surfaces — the user menu's "Clear All Local Data" and the root error screen's
 * reset — state the number before they proceed (#1098, cashier-full-information).
 *
 * WHY A REMEMBERED COUNT AND NOT ONLY A LIVE READ. The root error boundary
 * renders ABOVE every provider: while it is on screen there is no query runtime,
 * no engine handle, and quite possibly no database that will open at all — that
 * is usually WHY it is on screen. It does still have this module, because what
 * broke is the React tree, not the JS runtime. So the app records the queue
 * depth as it changes and the crash screen reads the last recorded value.
 *
 * The reading is deliberately three-valued, and `unknown` is NOT `none`: a reset
 * that cannot count must warn that it MAY destroy unsent sales rather than imply
 * it will not. It must not REFUSE either — the reset exists to recover a profile
 * too broken to open, so a hard block would take away the only way out.
 */

/**
 * `unknown` = the count could not be established. It is a distinct answer from
 * `none`, and every caller has to keep it that way: assume the worst, never
 * "nothing".
 */
export type UnsentChanges =
	{ status: 'unknown' } | { status: 'none' } | { status: 'some'; count: number };

/**
 * Held on `globalThis` rather than in a module-local `let` so that a bundler
 * which hands the crash screen a second copy of this module still reads the
 * value the app wrote. A duplicate module would otherwise read "never recorded"
 * and quietly downgrade a real count to `unknown`.
 */
const SLOT_KEY = '__wcposUnsentChanges';

/**
 * `count` is the ACTIVE scope's queue. `legacy` is what the previous-generation
 * drain left behind, by database name: a `kept` database still holds unsent
 * work that lives in NO active queue — but "Clear all local data" deletes it
 * with everything else, so it belongs in the same number. `null` there means
 * the drain has not reported on that database yet in this process.
 */
type Slot = { count: number | null; legacy?: Map<string, number | null> };

function slot(): Slot {
	const host = globalThis as unknown as Record<string, Slot | undefined>;
	const existing = host[SLOT_KEY];
	if (existing) {
		existing.legacy ??= new Map();
		return existing;
	}
	const created: Slot = { count: null, legacy: new Map() };
	host[SLOT_KEY] = created;
	return created;
}

function legacyCounts(): Map<string, number | null> {
	return slot().legacy!;
}

/**
 * Record what the previous-generation drain found in one database: the count of
 * unsent rows it KEPT, 0 once it is drained or absent, or `null` while the drain
 * has not reported (it is pending, waiting to retry, or could not open it).
 */
export function rememberLegacyUnsentChanges(databaseName: string, count: number | null): void {
	const normalized = normalize(count);
	if (normalized === 0) legacyCounts().delete(databaseName);
	else legacyCounts().set(databaseName, normalized);
}

/** Unsent rows every kept previous-generation database is known to hold. */
export function legacyUnsentChangesCount(): number {
	let total = 0;
	for (const count of legacyCounts().values()) total += count ?? 0;
	return total;
}

/**
 * True while a previous-generation database may still hold work that has not
 * reached the active database: it was kept, or the drain has not reported yet.
 * Anything that would give up on a record for "not being here" waits for this.
 */
export function legacyUnsentChangesMayRemain(): boolean {
	for (const count of legacyCounts().values()) if (count === null || count > 0) return true;
	return false;
}

function normalize(count: number | null | undefined): number | null {
	if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null;
	return Math.floor(count);
}

/**
 * Classify the ACTIVE queue's count, adding what kept previous-generation
 * databases hold (`rememberLegacyUnsentChanges`) — a wipe destroys both.
 */
export function classifyUnsentChanges(count: number | null | undefined): UnsentChanges {
	const normalized = normalize(count);
	if (normalized === null) return { status: 'unknown' };
	const total = normalized + legacyUnsentChangesCount();
	if (total > 0) return { status: 'some', count: total };
	// A previous-generation database the drain has not reported on yet is not proof of nothing.
	return [...legacyCounts().values()].includes(null) ? { status: 'unknown' } : { status: 'none' };
}

/**
 * Record the current queue depth. A value that is not a usable count (a failed
 * read, a closed database) records `unknown` rather than leaving the previous
 * number in place — a stale zero is the one answer that could get a sale wiped
 * without a word.
 */
export function rememberUnsentChanges(count: number | null | undefined): void {
	slot().count = normalize(count);
}

/** Forget the count — after a wipe there is nothing left to lose. */
export function forgetUnsentChanges(): void {
	slot().count = null;
	legacyCounts().clear();
}

/** The last recorded reading. Never throws; `unknown` when nothing was recorded. */
export function readUnsentChanges(): UnsentChanges {
	try {
		return classifyUnsentChanges(slot().count);
	} catch {
		return { status: 'unknown' };
	}
}
