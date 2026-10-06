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
 * `settled`: every name reported nothing kept on a complete history; later
 * boots skip the inventory.
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

type HistoryData = { names: string[]; complete: boolean; settled: boolean };

export type LegacyScopeHistory = Readonly<HistoryData> & {
	/** Record that every name reported nothing kept: later boots count exactly. */
	markSettled(): Promise<void>;
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
	const names = doc.get('names');
	return {
		names: Array.isArray(names)
			? names.filter((name): name is string => typeof name === 'string')
			: [],
		complete: doc.get('complete') === true,
		settled: doc.get('settled') === true,
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
		settled: false,
	};
	// A missing history has no names, so its first scope always writes it (completeness included).
	if (!data.names.includes(name)) {
		data = { ...data, names: [...data.names, name] };
		await db.upsertLocal(HISTORY_LOCAL_ID, data);
	}
	return {
		...data,
		markSettled: async () => {
			const latest = (await readHistory(db)) ?? data;
			await db.upsertLocal(HISTORY_LOCAL_ID, { ...latest, settled: true });
		},
	};
}
