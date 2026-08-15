/**
 * The reactive half of `engine.coverageChanges` — everything needed to keep a
 * `CoverageVerdict` current for one target, and nothing about what a verdict MEANS (that is
 * `coverage-verdicts.ts`).
 *
 * Three things can change a verdict and only one of them is a row write:
 *
 *  1. the lane / query-total row itself — an `findOne(primaryKey).$` subscription per table,
 *     addressed by primary key rather than scanned, so a busy collection's other lanes cost
 *     this subscription nothing;
 *  2. the scope database — a switch opens a different database, and a RESET re-emits the SAME
 *     database object with its collections replaced, so captured collection references go
 *     stale and every subscription must be re-resolved through `activeDatabase()` on each
 *     emission (not just when the identity changes); and
 *  3. the clock — nothing writes a row at `freshUntilMs`, so a `fresh: true` verdict has to be
 *     republished at its own deadline or it outlives its truth.
 *
 * There is no scope in which this throws. No database, no collections, no lane key for a
 * reference collection: all of them publish the unknown verdict, which is the contract's way of
 * saying "the engine cannot vouch for this" — the caller's fallback is the caller's business.
 */

import { laneKeyFor } from '../scheduler';
import {
	type CoverageTarget,
	type CoverageVerdict,
	coverageVerdictFrom,
	nextCoverageExpiryMs,
	queryKeyBelongsToCollection,
} from './coverage-verdicts';
// Through the facade, not `./persistence` directly: the lane's primary-key format is a
// LocalCoverage fact, and the facade is its only sanctioned door (local-coverage.test.ts).
import { coverageLaneKey } from './local-coverage';

import type { QueryTotalCacheDocument } from '../scheduler';
import type { CoverageLaneDocument } from './coverage-schema';
import type { RxDatabase } from 'rxdb';

type Unsubscribe = () => void;

/** The slice of RxDB this module uses, named structurally so the tables stay package-private. */
type LiveDocument<T> = { toJSON(): T };
/**
 * `error` is not optional here on purpose. A storage query that fails TERMINATES its stream, so
 * a handler-less subscription would leave this hub silently frozen on its last verdict while
 * nothing is watching the row any more — the one failure mode a coverage verdict must not have.
 */
type LiveObserver<T> = {
	next(document: LiveDocument<T> | null): void;
	error(error: unknown): void;
};
type LiveCollection<T> = {
	findOne(documentId: string): {
		$: { subscribe(observer: LiveObserver<T>): { unsubscribe(): void } };
	};
};

export type CoverageChangeHubPorts = {
	/** The active scope's database, or null when no scope is open. */
	activeDatabase(): RxDatabase | null;
	now(): number;
	diagnostics(event: { type: 'engine.listener-error'; level: 'error'; message: string }): void;
};

export type CoverageChangeHub = {
	subscribe(target: CoverageTarget, cb: (verdict: CoverageVerdict) => void): Unsubscribe;
	/** Re-resolve every subscription against the CURRENT database (scope switch / reset). */
	republish(): void;
	/** Terminal: drops every timer and storage subscription and makes publishing inert. */
	dispose(): void;
};

type Entry = {
	collection: string;
	/** null ⇒ nothing addressable (a reference collection with no lane) ⇒ permanently unknown. */
	queryKey: string | null;
	callback: (verdict: CoverageVerdict) => void;
	/** Bumped on every re-resolve; a storage emission from a superseded generation is dropped. */
	generation: number;
	lane: CoverageLaneDocument | null;
	queryTotal: QueryTotalCacheDocument | null;
	storage: { unsubscribe(): void }[];
	expiryTimer: ReturnType<typeof setTimeout> | null;
};

function collectionOf<T>(database: RxDatabase, name: string): LiveCollection<T> | null {
	const collection = (database.collections as Record<string, unknown>)[name] as
		LiveCollection<T> | undefined;
	return collection ?? null;
}

export function createCoverageChangeHub(ports: CoverageChangeHubPorts): CoverageChangeHub {
	const entries = new Set<Entry>();
	let disposed = false;

	const clearStorage = (entry: Entry): void => {
		for (const subscription of entry.storage.splice(0)) {
			try {
				subscription.unsubscribe();
			} catch {
				// A collection torn down under us has already dropped the subscription.
			}
		}
	};

	const clearTimer = (entry: Entry): void => {
		if (entry.expiryTimer === null) return;
		clearTimeout(entry.expiryTimer);
		entry.expiryTimer = null;
	};

	const reportFailure = (what: string, error: unknown): void => {
		ports.diagnostics({
			type: 'engine.listener-error',
			level: 'error',
			message: `coverageChanges() ${what} failed: ${error instanceof Error ? error.message : String(error)}`,
		});
	};

	const publish = (entry: Entry): void => {
		if (disposed) return;
		const now = ports.now();
		const verdict = coverageVerdictFrom(entry.lane, entry.queryTotal, now);
		clearTimer(entry);
		const expiry = nextCoverageExpiryMs(entry.lane, entry.queryTotal, now);
		if (expiry !== null) {
			entry.expiryTimer = setTimeout(
				() => {
					entry.expiryTimer = null;
					publish(entry);
				},
				Math.max(0, expiry - now) + 1
			);
		}
		try {
			entry.callback(verdict);
		} catch (error) {
			ports.diagnostics({
				type: 'engine.listener-error',
				level: 'error',
				message: `coverageChanges() listener threw: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	};

	const resolve = (entry: Entry): void => {
		if (disposed) return;
		entry.generation += 1;
		const generation = entry.generation;
		clearStorage(entry);
		// A reset removes this key's rows; anything remembered from the previous database is a
		// claim the engine can no longer stand behind, so re-resolving always starts from unknown.
		entry.lane = null;
		entry.queryTotal = null;
		publish(entry);
		const queryKey = entry.queryKey;
		if (queryKey === null) return;
		const database = ports.activeDatabase();
		if (database === null) return;
		const lanes = collectionOf<CoverageLaneDocument>(database, 'coverageLanes');
		const totals = collectionOf<QueryTotalCacheDocument>(database, 'queryTotalCacheEntries');
		if (lanes !== null) {
			entry.storage.push(
				lanes.findOne(coverageLaneKey(entry.collection, queryKey)).$.subscribe({
					next: (document) => {
						if (entry.generation !== generation) return;
						entry.lane = document === null ? null : document.toJSON();
						publish(entry);
					},
					// The stream is dead after this, so the lane is no longer being watched — drop
					// what it told us and republish rather than freeze on a claim nothing maintains.
					error: (error) => {
						if (entry.generation !== generation) return;
						reportFailure('coverage lane subscription', error);
						entry.lane = null;
						publish(entry);
					},
				})
			);
		}
		// The query-total table is keyed by queryKey ALONE — no collection column — so its
		// namespace is the only thing separating one collection's cached server total from
		// another's. A key outside this target's namespace is not this target's total, and the
		// cheapest way to honour that is never to open the subscription.
		if (totals !== null && queryKeyBelongsToCollection(entry.collection, queryKey)) {
			entry.storage.push(
				totals.findOne(queryKey).$.subscribe({
					next: (document) => {
						if (entry.generation !== generation) return;
						entry.queryTotal = document === null ? null : document.toJSON();
						publish(entry);
					},
					error: (error) => {
						if (entry.generation !== generation) return;
						reportFailure('query-total subscription', error);
						entry.queryTotal = null;
						publish(entry);
					},
				})
			);
		}
	};

	return {
		subscribe: (target, cb) => {
			const entry: Entry = {
				collection: target.collection,
				queryKey: 'queryKey' in target ? target.queryKey : laneKeyFor(target.collection),
				callback: cb,
				generation: 0,
				lane: null,
				queryTotal: null,
				storage: [],
				expiryTimer: null,
			};
			entries.add(entry);
			resolve(entry);
			return () => {
				entries.delete(entry);
				clearStorage(entry);
				clearTimer(entry);
			};
		},
		republish: () => {
			if (disposed) return;
			for (const entry of [...entries]) resolve(entry);
		},
		dispose: () => {
			disposed = true;
			for (const entry of [...entries]) {
				clearStorage(entry);
				clearTimer(entry);
			}
			entries.clear();
		},
	};
}
