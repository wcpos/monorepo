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
 * exact on it. "Created in this run" is read from IDENTITY, not time: rxdb writes
 * the user database's storage token once, when the database is created, and
 * stamps it with the creating database instance's token (`data.instanceToken`).
 * The history is complete only when that is THIS database instance. (A clock
 * moved backwards makes an old token look newer than the process; an identity
 * cannot be fooled that way.) A token without an instance id falls back to time,
 * with a token from the future read as inconclusive — incomplete.
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
 * Only for a storage token without an instance id: how far in the future its write time may be
 * before it proves nothing. Five minutes covers ordinary clock drift and NTP corrections; a token
 * further ahead than that was written under a clock that has since moved back, so it cannot show
 * the database was created in this run.
 */
const STORAGE_TOKEN_CLOCK_SKEW_MS = 5 * 60_000;

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
	getLocal(id: string): Promise<{
		get(key: string): unknown;
		/** rxdb's write queue: the modifier re-runs on the LATEST data until it lands. */
		incrementalModify(
			modifier: (data: HistoryData) => HistoryData | Promise<HistoryData>
		): Promise<unknown>;
	} | null>;
	insertLocal(id: string, data: HistoryData): Promise<unknown>;
	/** This database instance's token (rxdb's `RxDatabase.token`). */
	token: string;
	internalStore: {
		findDocumentsById(
			ids: string[],
			withDeleted: boolean
		): Promise<{ _meta: { lwt: number }; data?: { instanceToken?: unknown } }[]>;
	};
};

async function appDatabaseCreatedInThisRun(db: ScopeHistoryDatabase): Promise<boolean> {
	const [storageToken] = await db.internalStore.findDocumentsById(
		[STORAGE_TOKEN_DOCUMENT_ID],
		false
	);
	// No token is no evidence of a fresh database: read it as late (never settles — the safe side).
	if (storageToken === undefined) return false;
	const instanceToken = storageToken.data?.instanceToken;
	if (typeof instanceToken === 'string') return instanceToken === db.token;
	const writtenAt = storageToken._meta.lwt;
	return (
		writtenAt >= PROCESS_STARTED_AT_MS && writtenAt <= Date.now() + STORAGE_TOKEN_CLOCK_SKEW_MS
	);
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((name): name is string => typeof name === 'string')
		: [];
}

function normalized(data: Partial<HistoryData> | undefined): HistoryData {
	return {
		names: strings(data?.names),
		complete: data?.complete === true,
		cleared: strings(data?.cleared),
	};
}

/**
 * Change the history ATOMICALLY: the modifier runs inside rxdb's incremental write of the latest
 * local document (re-run on a conflict) — two layout effects on a rapid scope change, or a clear
 * landing beside an open, must never write back a stale copy and drop the other's name. A
 * missing history is created (deciding completeness); a creation that loses the race modifies
 * the winner's document instead. Returns the history as written.
 */
async function modifyHistory(
	db: ScopeHistoryDatabase,
	modify: (data: HistoryData) => HistoryData
): Promise<HistoryData> {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const doc = await db.getLocal(HISTORY_LOCAL_ID);
		if (doc) {
			let written: HistoryData | null = null;
			await doc.incrementalModify((data) => {
				written = modify(normalized(data));
				return written;
			});
			return written ?? normalized(undefined);
		}
		const created = modify({
			names: [],
			complete: await appDatabaseCreatedInThisRun(db),
			cleared: [],
		});
		try {
			await db.insertLocal(HISTORY_LOCAL_ID, created);
			return created;
		} catch (error) {
			// Another writer created it first: modify theirs on the next turn.
			if (attempt > 0) throw error;
		}
	}
	throw new Error('legacy scope history: could not be written');
}

/**
 * Record that `scope` is open (its drainable-generation name joins the history)
 * and return the history as it now stands. The first call on an install decides
 * whether the history is complete. A new name is uncleared: the history is no
 * longer settled until it reports.
 */
export async function recordScopeOpened(
	db: ScopeHistoryDatabase,
	scope: StoreScopeIdentity
): Promise<LegacyScopeHistory> {
	const name = scopeDatabaseName(scope, { generation: DRAINABLE_SCOPE_DATABASE_GENERATION });
	const data = await modifyHistory(db, (latest) =>
		latest.names.includes(name) ? latest : { ...latest, names: [...latest.names, name] }
	);
	return {
		...data,
		settled: data.complete && data.names.every((known) => data.cleared.includes(known)),
		markCleared: async (names) => {
			await modifyHistory(db, (latest) => ({
				...latest,
				cleared: [...new Set([...latest.cleared, ...names])],
			}));
		},
	};
}
