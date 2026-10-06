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
 * drain reported, by database name: a `kept` database still holds unsent work
 * that lives in NO active queue — but "Clear all local data" deletes it with
 * everything else, so it belongs in the same number.
 */
type LegacyReport = {
	/** The drain has not reported on this database yet in this process. */
	pending: boolean;
	/** Unsent rows it kept; `null` when it could not be counted (the drain failed to open it). */
	count: number | null;
	/** The orders those rows belong to. */
	orderUuids: readonly string[];
};

type Slot = {
	count: number | null;
	legacy?: Map<string, LegacyReport>;
	legacyListeners?: Set<() => void>;
};

function slot(): Slot {
	const host = globalThis as unknown as Record<string, Slot | undefined>;
	const existing = host[SLOT_KEY] ?? { count: null };
	existing.legacy ??= new Map();
	existing.legacyListeners ??= new Set();
	host[SLOT_KEY] = existing;
	return existing;
}

function legacyReports(): Map<string, LegacyReport> {
	return slot().legacy!;
}

function notifyLegacyListeners(): void {
	for (const listener of [...slot().legacyListeners!]) listener();
}

/**
 * The previous-generation drain is about to look at one database: until it
 * reports, that database MAY hold unsent work (a wipe cannot say "none", and a
 * reader that needs the report can wait for it — `awaitLegacyUnsentReports`).
 */
export function markLegacyDrainPending(databaseName: string): void {
	legacyReports().set(databaseName, { pending: true, count: null, orderUuids: [] });
}

/**
 * Record what the previous-generation drain reported for one database: the
 * count of unsent rows it KEPT and the orders they belong to, 0 once it is
 * drained or absent, or `null` when it could not count them (it failed to open).
 */
export function rememberLegacyUnsentChanges(
	databaseName: string,
	count: number | null,
	orderUuids: readonly string[] = []
): void {
	const normalized = normalize(count);
	if (normalized === 0) legacyReports().delete(databaseName);
	else
		legacyReports().set(databaseName, {
			pending: false,
			count: normalized,
			orderUuids: [...orderUuids],
		});
	notifyLegacyListeners();
}

/** Unsent rows every kept previous-generation database is known to hold. */
export function legacyUnsentChangesCount(): number {
	let total = 0;
	for (const report of legacyReports().values()) total += report.count ?? 0;
	return total;
}

/** The orders a kept previous-generation database still holds unsent work for. */
export function legacyUnsentOrderUuids(): ReadonlySet<string> {
	const uuids = new Set<string>();
	for (const report of legacyReports().values())
		for (const uuid of report.orderUuids) uuids.add(uuid);
	return uuids;
}

function legacyReportPending(): boolean {
	for (const report of legacyReports().values()) if (report.pending) return true;
	return false;
}

/**
 * Wait until no previous-generation drain is still to report — at most
 * `timeoutMs`. Resolves `'reported'` at once when nothing is pending, and
 * `'timed-out'` when the bound elapses first (an offline till's drain waits for
 * the store; its report may be a long way off).
 */
export function awaitLegacyUnsentReports(timeoutMs: number): Promise<'reported' | 'timed-out'> {
	if (!legacyReportPending()) return Promise.resolve('reported');
	return new Promise((resolve) => {
		const listeners = slot().legacyListeners!;
		const settle = (result: 'reported' | 'timed-out') => {
			clearTimeout(timer);
			listeners.delete(check);
			resolve(result);
		};
		const check = () => {
			if (!legacyReportPending()) settle('reported');
		};
		const timer = setTimeout(() => settle('timed-out'), timeoutMs);
		listeners.add(check);
	});
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
	// A previous-generation database the drain has not reported on (or could not count) is not
	// proof of nothing.
	return [...legacyReports().values()].some((report) => report.count === null)
		? { status: 'unknown' }
		: { status: 'none' };
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
	legacyReports().clear();
	notifyLegacyListeners();
}

/** The last recorded reading. Never throws; `unknown` when nothing was recorded. */
export function readUnsentChanges(): UnsentChanges {
	try {
		return classifyUnsentChanges(slot().count);
	} catch {
		return { status: 'unknown' };
	}
}
