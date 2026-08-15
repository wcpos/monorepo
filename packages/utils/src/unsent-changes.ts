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

type Slot = { count: number | null };

function slot(): Slot {
	const host = globalThis as unknown as Record<string, Slot | undefined>;
	const existing = host[SLOT_KEY];
	if (existing) return existing;
	const created: Slot = { count: null };
	host[SLOT_KEY] = created;
	return created;
}

function normalize(count: number | null | undefined): number | null {
	if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null;
	return Math.floor(count);
}

export function classifyUnsentChanges(count: number | null | undefined): UnsentChanges {
	const normalized = normalize(count);
	if (normalized === null) return { status: 'unknown' };
	return normalized === 0 ? { status: 'none' } : { status: 'some', count: normalized };
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
}

/** The last recorded reading. Never throws; `unknown` when nothing was recorded. */
export function readUnsentChanges(): UnsentChanges {
	try {
		return classifyUnsentChanges(slot().count);
	} catch {
		return { status: 'unknown' };
	}
}
