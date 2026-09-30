import { DERIVABLE_METADATA_COLLECTIONS } from '../collections/engine-collections';

// Each peer removal can close one more collection: five removals need at most five
// re-attaches; the +1 is the retry that lands after the last removal.
export const LEDGER_REATTACH_ATTEMPTS = DERIVABLE_METADATA_COLLECTIONS.length + 1;

export type LedgerRebuildTrigger = 'coverage' | 'scheduler' | 'query-total';
type LedgerRecoveryKind = 'reattach';

/**
 * Any database object. Kept as bare `object` because the callers hold different
 * structural views of the same database (`RxDatabase`, `CoverageDatabase`,
 * `SchedulerTaskStateDatabase`); the name and close hook are read defensively.
 */
type LedgerRecoveryDatabase = object;
type NamedDatabase = { name?: unknown; token?: unknown; onClose?: unknown };

type LedgerRecoveryEntry = {
	/** The database instance the registration was made for — re-registration identity. */
	database: object;
	rebuild: (
		reason: string,
		trigger: LedgerRebuildTrigger,
		kind: LedgerRecoveryKind
	) => Promise<void>;
	/**
	 * The single in-flight rebuild. Startup, the maintenance lanes and the scheduler
	 * drain run concurrently, so several callers catch the same closed collection; they share
	 * one reattachment.
	 */
	pendingRebuild: Promise<void> | undefined;
	/** Bumped once per completed rebuild; proxies rebuild their repository when it moves. */
	generation: number;
};

/** Per-instance COL21 recovery; closing a database releases its registration. */
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
	if (typeof name === 'string' && name.length > 0) {
		// Separate live RxDB instances sharing storage (including peers in one realm).
		const token = (database as NamedDatabase).token;
		return typeof token === 'string' ? `${name}:${token}` : name;
	}
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

export function classifyLedgerRecoveryError(
	error: unknown
): { kind: LedgerRecoveryKind; reason: string } | undefined {
	if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'COL21') {
		return { kind: 'reattach', reason: 'COL21' };
	}
	return undefined;
}

/** Register the collection reattachment owned by `createLocalCoverage`. */
export function registerLedgerRecovery(input: {
	database: LedgerRecoveryDatabase;
	rebuild: LedgerRecoveryEntry['rebuild'];
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
	trigger: LedgerRebuildTrigger,
	kind: LedgerRecoveryKind
): Promise<void> {
	if (!entry.pendingRebuild) {
		entry.pendingRebuild = entry
			.rebuild(reason, trigger, kind)
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
 * caller, or a reattachment that itself failed.
 */
async function awaitLedgerRebuild(input: {
	database: LedgerRecoveryDatabase | undefined;
	error: unknown;
	reason: string;
	kind: LedgerRecoveryKind;
	entryAtStart: LedgerRecoveryEntry | undefined;
	generationAtStart: number;
	trigger: LedgerRebuildTrigger;
}): Promise<void> {
	// No registered rebuild (or the database was closed and re-registered under us):
	// nothing registered to reattach, so the error is the caller's problem.
	const entry = lookupEntry(input.database);
	if (!entry || entry !== input.entryAtStart) throw input.error;

	// Someone else's rebuild landed while this operation was in flight.
	if (entry.generation !== input.generationAtStart) return;

	// A rebuild is running right now — wait for it rather than leaking the error
	// into an otherwise recoverable caller. If it fails, this operation genuinely
	// failed, so surface its own storage error.
	if (entry.pendingRebuild) {
		await entry.pendingRebuild.catch(() => {
			throw input.error;
		});
		return;
	}

	await rebuildLedgerOnce(entry, input.reason, input.trigger, input.kind);
}

async function retryLedgerReattachment<T>(
	input: { database: LedgerRecoveryDatabase | undefined; trigger?: LedgerRebuildTrigger },
	run: () => T | Promise<T>
): Promise<T> {
	// The caller already performed the first re-attach.
	for (let attempts = 1; ; attempts += 1) {
		const entryAtStart = lookupEntry(input.database);
		const generationAtStart = entryAtStart?.generation ?? 0;
		try {
			return await run();
		} catch (error) {
			const recovery = classifyLedgerRecoveryError(error);
			if (recovery?.kind !== 'reattach' || attempts >= LEDGER_REATTACH_ATTEMPTS) throw error;
			await awaitLedgerRebuild({
				database: input.database,
				error,
				...recovery,
				entryAtStart,
				generationAtStart,
				trigger: input.trigger ?? 'scheduler',
			});
		}
	}
}

/** Retry COL21 reads against repositories refreshed after collection reattachment. */
export function withLedgerRecovery<T extends object>(input: {
	database: LedgerRecoveryDatabase;
	trigger: LedgerRebuildTrigger;
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
			const recovery = classifyLedgerRecoveryError(error);
			if (recovery === undefined) throw error;
			await awaitLedgerRebuild({
				database: input.database,
				error,
				...recovery,
				entryAtStart,
				generationAtStart,
				trigger: input.trigger,
			});
			return retryLedgerReattachment(input, () => invoke(property, args));
		}
	};

	return new Proxy(repository, {
		get: (_target, property) => {
			const value = Reflect.get(currentRepository(), property);
			return typeof value === 'function' ? (...args: unknown[]) => run(property, args) : value;
		},
	});
}

/** Seeds hold no claims, so COL21 can reattach collections and retry the seed. */
export async function withSchedulerSeedLedgerRecovery<T>(input: {
	database: LedgerRecoveryDatabase | undefined;
	run: () => Promise<T>;
}): Promise<T> {
	const entryAtStart = lookupEntry(input.database);
	const generationAtStart = entryAtStart?.generation ?? 0;
	try {
		return await input.run();
	} catch (error) {
		const recovery = classifyLedgerRecoveryError(error);
		if (recovery === undefined) throw error;
		await awaitLedgerRebuild({
			database: input.database,
			error,
			...recovery,
			entryAtStart,
			generationAtStart,
			trigger: 'scheduler',
		});
		return retryLedgerReattachment(input, input.run);
	}
}

/**
 * Reattach after COL21, then abort the drain: its claims may no longer exist.
 * The caller keeps the `ledgerRebuilt` flag so demand is released, not reported fetched.
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
		const recovery = classifyLedgerRecoveryError(error);
		if (recovery === undefined) throw error;
		await awaitLedgerRebuild({
			database: input.database,
			error,
			...recovery,
			entryAtStart,
			generationAtStart,
			trigger: 'scheduler',
		});
		// A peer's rebuild dropped this tick's claims exactly as a local rebuild would,
		// so a re-attach aborts cleanly too: the collections are usable again and the
		// next cadence re-claims against the fresh store.
		return input.aborted();
	}
}
