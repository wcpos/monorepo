const RECONCILIATION_REFUSAL_MARKER = 'index reconciliation refused:';
const NON_CORRUPTION_REFUSALS = new Set(['no-divergence', 'multi-instance']);

/**
 * Which repository family caught the refusal that started a rebuild. The ledger is
 * ONE unit of three collections (DERIVABLE_METADATA_COLLECTIONS) but two repository
 * families read it: `RxCoverageRepository` (coverageRecords/coverageLanes) and
 * `RxSchedulerTaskStateRepository` (schedulerTaskStates). Either can catch the
 * refusal first — the trigger rides the diagnostics event so the log says which.
 */
export type LedgerRebuildTrigger = 'coverage' | 'scheduler';

/**
 * Any database object. Kept as bare `object` because the callers hold different
 * structural views of the same database (`RxDatabase`, `CoverageDatabase`,
 * `SchedulerTaskStateDatabase`); the name and close hook are read defensively.
 */
type LedgerRecoveryDatabase = object;
type NamedDatabase = { name?: unknown; onClose?: unknown };

type LedgerRecoveryEntry = {
	/** The database instance the registration was made for — re-registration identity. */
	database: object;
	rebuild: (reason: string, trigger: LedgerRebuildTrigger) => Promise<void>;
	/**
	 * The single in-flight rebuild. Startup, the maintenance lanes and the scheduler
	 * drain run concurrently, so several callers catch the same refusal; they share
	 * one rebuild rather than each dropping the ledger in turn.
	 */
	pendingRebuild: Promise<void> | undefined;
	/** Bumped once per completed rebuild; proxies rebuild their repository when it moves. */
	generation: number;
	/** The one-shot: exactly one automatic rebuild per live database. */
	rebuilt: boolean;
};

/**
 * Per-database ledger recovery, keyed by database name.
 *
 * `createLocalCoverage` registers the rebuild closure (it owns the drop/recreate
 * recipe and the diagnostics observer); BOTH repository families then trigger
 * through the same entry, so one guard, one in-flight rebuild and one
 * `coverage.ledger-rebuilt` emission cover the whole ledger (#956).
 *
 * Lifecycle: the entry is removed when the database closes (`db.onClose`), and a
 * registration for a different instance of the same name replaces it. So the
 * one-shot guard is scoped to a LIVE database, not to the process:
 *
 *  - it keeps #942's anti-loop property — within one open database the ledger is
 *    rebuilt at most once, and a refusal that survives the rebuild surfaces;
 *  - it stops the registry pinning a closed RxDatabase (and a rebuild closure that
 *    would drop collections on it) alive for the session;
 *  - a database created AFTER a Clear & Sync or a store switch is new storage whose
 *    refusals are new information, so it is not denied its one recovery because a
 *    predecessor of the same name used the guard. Nothing re-opens a database
 *    automatically, so this cannot loop.
 */
const registry = new Map<string, LedgerRecoveryEntry>();

/**
 * Test databases are sometimes plain objects with no `name`. Give each one a stable
 * synthetic key so they get their own registry entry instead of colliding on a
 * shared undefined-name slot.
 */
const syntheticKeys = new WeakMap<object, string>();
let syntheticSequence = 0;

function registryKey(database: LedgerRecoveryDatabase | undefined): string | undefined {
	if (!database || typeof database !== 'object') return undefined;
	const name = (database as NamedDatabase).name;
	if (typeof name === 'string' && name.length > 0) return name;
	let synthetic = syntheticKeys.get(database);
	if (synthetic === undefined) {
		synthetic = `ledger-recovery-anonymous:${(syntheticSequence += 1)}`;
		syntheticKeys.set(database, synthetic);
	}
	return synthetic;
}

function lookupEntry(
	database: LedgerRecoveryDatabase | undefined
): LedgerRecoveryEntry | undefined {
	const key = registryKey(database);
	return key === undefined ? undefined : registry.get(key);
}

function errorMessage(error: unknown): string | undefined {
	if (typeof error === 'string') return error;
	if (
		error !== null &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message;
	}
	return undefined;
}

function reconciliationRefusalReason(error: unknown): string | undefined {
	const message = errorMessage(error);
	const markerIndex = message?.indexOf(RECONCILIATION_REFUSAL_MARKER) ?? -1;
	if (!message || markerIndex < 0) return undefined;
	const raw = message.slice(markerIndex + RECONCILIATION_REFUSAL_MARKER.length).trim();
	// On web the refusal crosses the storage worker boundary JSON-serialized:
	// rx-storage-remote rethrows worker errors as
	//   could not requestRemote: {..."message":"...; index reconciliation refused: X","stack":"..."}
	// so everything after the refusal token — the closing quote of the JSON
	// string and the rest of the blob — is serialization, not reason. Cut at the
	// first (possibly escape-prefixed) double quote; a bare refusal has none.
	const quoteIndex = raw.indexOf('"');
	const head = quoteIndex < 0 ? raw : raw.slice(0, quoteIndex);
	return head.replace(/[\\\s]+$/u, '').trim();
}

/** The refusal reason when the error is a CORRUPTION refusal, otherwise undefined. */
function corruptionRefusalReason(error: unknown): string | undefined {
	const reason = reconciliationRefusalReason(error);
	if (reason === undefined || NON_CORRUPTION_REFUSALS.has(reason)) return undefined;
	return reason;
}

export function isReconciliationRefusalError(error: unknown): boolean {
	return corruptionRefusalReason(error) !== undefined;
}

/**
 * Register the ledger rebuild for one database. Called by `createLocalCoverage`,
 * which owns the drop/recreate recipe for all three derivable collections and the
 * diagnostics observer that reports it.
 */
export function registerLedgerRecovery(input: {
	database: LedgerRecoveryDatabase;
	rebuild: (reason: string, trigger: LedgerRebuildTrigger) => Promise<void>;
}): void {
	const key = registryKey(input.database);
	if (key === undefined) return;
	const existing = registry.get(key);
	if (existing && existing.database === input.database) {
		// Same live database re-registering (a second createLocalCoverage over one
		// scope): keep the guard and any in-flight rebuild, refresh the closure.
		existing.rebuild = input.rebuild;
		return;
	}
	const entry: LedgerRecoveryEntry = {
		database: input.database,
		rebuild: input.rebuild,
		pendingRebuild: undefined,
		generation: 0,
		rebuilt: false,
	};
	registry.set(key, entry);
	const onClose = (input.database as NamedDatabase).onClose;
	if (Array.isArray(onClose)) {
		onClose.push(() => {
			if (registry.get(key) === entry) registry.delete(key);
		});
	}
}

function rebuildLedgerOnce(
	entry: LedgerRecoveryEntry,
	reason: string,
	trigger: LedgerRebuildTrigger
): Promise<void> {
	if (!entry.pendingRebuild) {
		entry.pendingRebuild = entry
			.rebuild(reason, trigger)
			.then(() => {
				entry.generation += 1;
			})
			.finally(() => {
				entry.pendingRebuild = undefined;
			});
	}
	return entry.pendingRebuild;
}

/**
 * Waits until a ledger rebuild covering `error` has completed, so the caller can
 * take its recovery action (retry, or abort its tick). Rethrows the original error
 * when no rebuild is available: no registration, a registration replaced under the
 * caller, the one-shot already spent, or a rebuild that itself failed.
 */
async function awaitLedgerRebuild(input: {
	database: LedgerRecoveryDatabase | undefined;
	error: unknown;
	reason: string;
	entryAtStart: LedgerRecoveryEntry | undefined;
	generationAtStart: number;
	trigger: LedgerRebuildTrigger;
}): Promise<void> {
	// No registered rebuild (or the database was closed and re-registered under us):
	// nothing safe to drop, so the refusal is the caller's problem.
	const entry = lookupEntry(input.database);
	if (!entry || entry !== input.entryAtStart) throw input.error;

	// Someone else's rebuild landed while this operation was in flight.
	if (entry.generation !== input.generationAtStart) return;

	// A rebuild is running right now — wait for it rather than leaking the refusal
	// into an otherwise recoverable caller. If it fails, this operation genuinely
	// failed, so surface its own storage error.
	if (entry.pendingRebuild) {
		await entry.pendingRebuild.catch(() => {
			throw input.error;
		});
		return;
	}

	if (entry.rebuilt) throw input.error;
	entry.rebuilt = true;
	await rebuildLedgerOnce(entry, input.reason, input.trigger);
}

/**
 * Proxies a repository whose refusals are RECOVERABLE by retry: the ledger is
 * rebuilt (once), the repository is rebuilt against the recreated collections, and
 * the failed operation runs again. An operation whose failure predates a completed
 * rebuild retries against the refreshed ledger instead of rethrowing a stale error.
 * Same shape as the worker's own reconcileOnce/reconcileGeneration
 * (packages/database/src/plugins/opfs-targeted-recovery.mjs).
 */
export function withLedgerRecovery<T extends object>(input: {
	database: LedgerRecoveryDatabase;
	/** Builds a repository over the CURRENT collections; re-run after each rebuild. */
	create: () => T;
}): T {
	let repository = input.create();
	let generation = lookupEntry(input.database)?.generation ?? 0;

	const currentRepository = (): T => {
		const entry = lookupEntry(input.database);
		if (entry && entry.generation !== generation) {
			repository = input.create();
			generation = entry.generation;
		}
		return repository;
	};

	const invoke = (property: string | symbol, args: unknown[]): unknown => {
		const target = currentRepository();
		return Reflect.apply(
			Reflect.get(target, property) as (...methodArgs: unknown[]) => unknown,
			target,
			args
		);
	};

	const run = async (property: string | symbol, args: unknown[]): Promise<unknown> => {
		const entryAtStart = lookupEntry(input.database);
		const generationAtStart = entryAtStart?.generation ?? 0;
		try {
			return await invoke(property, args);
		} catch (error) {
			const reason = corruptionRefusalReason(error);
			if (reason === undefined) throw error;
			await awaitLedgerRebuild({
				database: input.database,
				error,
				reason,
				entryAtStart,
				generationAtStart,
				trigger: 'coverage',
			});
			return invoke(property, args);
		}
	};

	return new Proxy(repository, {
		get: (_target, property) => {
			const value = Reflect.get(currentRepository(), property);
			return typeof value === 'function' ? (...args: unknown[]) => run(property, args) : value;
		},
	});
}

/**
 * Runs one scheduler SEED with ledger recovery attached (#956).
 *
 * `schedulerTaskStates` is part of the same derivable ledger, but its refusals are
 * only ever raised through `RxSchedulerTaskStateRepository` — a family the coverage
 * proxy never sees. This is that family's trigger for the seed sites.
 *
 * A seed holds no claims: it is insert-if-absent against the ledger. So it takes
 * the SAME contract as the coverage side — rebuild once, then run the seed again
 * against the fresh (empty) store. Callers depend on that: the conflict-discard
 * path seeds a durable targeted re-pull BEFORE clearing local state, and POS
 * bootstrap marks a scope bootstrapped once its seed resolves. A silently empty
 * seed would strand both.
 */
export async function withSchedulerSeedLedgerRecovery<T>(input: {
	database: LedgerRecoveryDatabase | undefined;
	run: () => Promise<T>;
}): Promise<T> {
	const entryAtStart = lookupEntry(input.database);
	const generationAtStart = entryAtStart?.generation ?? 0;
	try {
		return await input.run();
	} catch (error) {
		const reason = corruptionRefusalReason(error);
		if (reason === undefined) throw error;
		await awaitLedgerRebuild({
			database: input.database,
			error,
			reason,
			entryAtStart,
			generationAtStart,
			trigger: 'scheduler',
		});
		// Exactly one retry: a refusal that survives the rebuild surfaces.
		return input.run();
	}
}

/**
 * Runs one scheduler DRAIN tick with ledger recovery attached (#956).
 *
 * Unlike a seed, a drain tick holds CLAIMS on rows in the store the rebuild drops,
 * so retrying would re-claim rows that no longer exist. The tick therefore ABORTS
 * CLEANLY — the rebuild runs, the caller gets the neutral result rather than an
 * error, nothing is re-claimed, and the next scheduler cadence reseeds and
 * re-claims against the fresh store. The neutral result is FLAGGED
 * (`ledgerRebuilt`) so a demand-driven caller can release instead of reporting the
 * requirement fetched.
 *
 * A refusal with no rebuild available (no registration, or the one-shot already
 * spent) still surfaces to the caller — today's behaviour, unchanged.
 */
export async function withSchedulerDrainLedgerRecovery<T>(input: {
	database: LedgerRecoveryDatabase | undefined;
	/** The neutral result for an aborted tick. */
	aborted: () => T;
	run: () => Promise<T>;
}): Promise<T> {
	const entryAtStart = lookupEntry(input.database);
	const generationAtStart = entryAtStart?.generation ?? 0;
	try {
		return await input.run();
	} catch (error) {
		const reason = corruptionRefusalReason(error);
		if (reason === undefined) throw error;
		await awaitLedgerRebuild({
			database: input.database,
			error,
			reason,
			entryAtStart,
			generationAtStart,
			trigger: 'scheduler',
		});
		return input.aborted();
	}
}
