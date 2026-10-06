/**
 * The till's SCOPE HISTORY, for platforms that cannot list their storage (web,
 * Electron): every scope it has opened since this build, as the DRAINABLE
 * generation's database name (the `pos_v5_…` that scope may have left behind),
 * kept in the user database's local documents.
 *
 * Why a history and not only the store registry: removing a site tombstones its
 * user records but never deletes its scope databases, so a site removed before
 * the upgrade drops out of the registry while its pos_v5 may still hold unsent
 * sales. The reset count (`inventoryLegacyScopeDatabases`) may only become exact
 * once every database the till could hold has reported.
 *
 * `complete`: the history can only name scopes opened from this build on. It is
 * complete when it began together with the app database — a fresh install at
 * this build. If the app database already existed when this build first wrote
 * the history, earlier scopes (and their pos_v5) may be unnamed: the history is
 * incomplete for the life of that install, and the reset count never becomes
 * exact on it. "Already existed" is read from the user database's storage token
 * — rxdb writes it once, when the database is created — against the time this
 * process started.
 *
 * `cleared`: the names that reported nothing kept (drained or absent) — a
 * pos_v5 cannot come back once gone, so a cleared name is never inventoried
 * again. `settled` is DERIVED, never stored: a complete history whose every name
 * is cleared. Opening a new scope adds an uncleared name, which un-settles the
 * history until that one name reports (the others stay cleared).
 */
import { STORAGE_TOKEN_DOCUMENT_ID } from 'rxdb';

import { DRAINABLE_SCOPE_DATABASE_GENERATION, scopeDatabaseName } from '@wcpos/sync-core';
import type { StoreScopeIdentity } from '@wcpos/sync-engine';

/** The user database's local document that holds the history. */
const HISTORY_LOCAL_ID = 'legacy-scope-history';

/** Any epoch time before this is not a real process start (an origin a platform does not report). */
const PLAUSIBLE_EPOCH_MS = Date.UTC(2020, 0, 1);

/**
 * When this process started: the platform's time origin where it has one (web,
 * Electron renderer), else this module's first evaluation. A storage token
 * written before it means the app database predates this run.
 */
const PROCESS_STARTED_AT_MS = (() => {
	const origin = (globalThis as { performance?: { timeOrigin?: number } }).performance?.timeOrigin;
	return typeof origin === 'number' && origin > PLAUSIBLE_EPOCH_MS ? origin : Date.now();
})();

type HistoryData = { names: string[]; complete: boolean; cleared: string[] };

export type LegacyScopeHistory = Readonly<HistoryData> & {
	/** Complete, and every name cleared: later boots count exactly without an inventory. */
	readonly settled: boolean;
	/** Record that these names reported nothing kept. */
	markCleared(names: readonly string[]): Promise<void>;
};

/** Structural: the user database's local documents and internal store. */
export type ScopeHistoryDatabase = {
	getLocal(id: string): Promise<{ get(key: string): unknown } | null>;
	upsertLocal(id: string, data: HistoryData): Promise<unknown>;
	internalStore: {
		findDocumentsById(ids: string[], withDeleted: boolean): Promise<{ _meta: { lwt: number } }[]>;
	};
};

async function appDatabasePredatesThisRun(db: ScopeHistoryDatabase): Promise<boolean> {
	const [token] = await db.internalStore.findDocumentsById([STORAGE_TOKEN_DOCUMENT_ID], false);
	// No token is no evidence of a fresh database: read it as late (never settles — the safe side).
	return token === undefined || token._meta.lwt < PROCESS_STARTED_AT_MS;
}

async function readHistory(db: ScopeHistoryDatabase): Promise<HistoryData | null> {
	const doc = await db.getLocal(HISTORY_LOCAL_ID);
	if (!doc) return null;
	const strings = (value: unknown): string[] =>
		Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : [];
	return {
		names: strings(doc.get('names')),
		complete: doc.get('complete') === true,
		cleared: strings(doc.get('cleared')),
	};
}

/**
 * Record that `scope` is open (its drainable-generation name joins the history)
 * and return the history as it now stands. The first call on an install decides
 * whether the history is complete.
 */
export async function recordScopeOpened(
	db: ScopeHistoryDatabase,
	scope: StoreScopeIdentity
): Promise<LegacyScopeHistory> {
	const name = scopeDatabaseName(scope, { generation: DRAINABLE_SCOPE_DATABASE_GENERATION });
	let data = (await readHistory(db)) ?? {
		names: [],
		complete: !(await appDatabasePredatesThisRun(db)),
		cleared: [],
	};
	// A missing history has no names, so its first scope always writes it (completeness included).
	// A new name is uncleared: the history is no longer settled until it reports.
	if (!data.names.includes(name)) {
		data = { ...data, names: [...data.names, name] };
		await db.upsertLocal(HISTORY_LOCAL_ID, data);
	}
	return {
		...data,
		settled: data.complete && data.names.every((known) => data.cleared.includes(known)),
		markCleared: async (names) => {
			const latest = (await readHistory(db)) ?? data;
			const cleared = [...new Set([...latest.cleared, ...names])];
			if (cleared.length === latest.cleared.length) return;
			await db.upsertLocal(HISTORY_LOCAL_ID, { ...latest, cleared });
		},
	};
}
