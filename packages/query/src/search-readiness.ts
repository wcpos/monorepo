import get from 'lodash/get';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { engineCollectionNameFor, LEGACY_SEARCH_FIELDS } from './engine-adapter/collection-map';
import { legacySearchSnapshot } from './engine-adapter/search-snapshot';
import { FLEXSEARCH_MIN_TERM_LENGTH, observeEngineDatabases } from './engine-query';
import {
	FLEXSEARCH_TOKEN_BOUNDARY,
	normalizeForScan,
	rebuiltSearchIndexes,
	type SearchableCollection,
	type SearchInstance,
	searchLogger,
	sharedSearchInstances,
} from './search-shared';

import type { LegacyCollectionName } from './engine-adapter/collection-map';
import type { AdapterDatabase, EngineRxDocument } from './engine-adapter/execute-query';

/**
 * The collections the till searches. Warming these at startup means the index
 * pipeline starts building at till-open, not on the first keystroke (#1733);
 * other searchable collections stay lazy and are covered by the scan fallback.
 */
const WARMUP_COLLECTIONS = [
	'products',
	'variations',
] as const satisfies readonly LegacyCollectionName[];

/** Let the boot I/O burst settle before opening the index pipelines. */
const SEARCH_WARMUP_DELAY_MS = 1_000;
/** First audit soon enough to catch a broken index within the first minutes of a shift. */
const SEARCH_INDEX_AUDIT_INITIAL_DELAY_MS = 60_000;
const SEARCH_INDEX_AUDIT_INTERVAL_MS = 10 * 60_000;
/**
 * An index that cannot answer within this window is treated as "not ready" and
 * the audit abstains — not-ready is the scan lane's problem, not a false miss.
 */
const SEARCH_INDEX_AUDIT_FIND_TIMEOUT_MS = 5_000;
/** How many of the sampled document's own tokens to try before calling it missed. */
const SEARCH_INDEX_AUDIT_TOKENS_PER_DOCUMENT = 3;
/**
 * Missed audits on DIFFERENT documents before declaring a false miss. One
 * document can legitimately carry only tokens the tokenizer drops (minlength
 * edges, encoding quirks); two distinct documents the index cannot find is an
 * index that cannot find its own content. A repeat sample of the same document
 * neither extends nor resets the streak — a single-document store therefore
 * never triggers a rebuild, and is covered by the scan fallback instead.
 */
const SEARCH_INDEX_AUDIT_FAILURE_THRESHOLD = 2;

const AUDIT_TIMED_OUT = Symbol('search-audit-timeout');

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof AUDIT_TIMED_OUT> {
	return new Promise((resolve, reject) => {
		const timeoutHandle = setTimeout(() => resolve(AUDIT_TIMED_OUT), ms);
		promise.then(
			(value) => {
				clearTimeout(timeoutHandle);
				resolve(value);
			},
			(error) => {
				clearTimeout(timeoutHandle);
				reject(error);
			}
		);
	});
}

function initializationOptionsFor(name: (typeof WARMUP_COLLECTIONS)[number]) {
	return {
		searchFields: [...LEGACY_SEARCH_FIELDS[name]],
		documentSnapshot: (document: EngineRxDocument) => legacySearchSnapshot(name, document),
	};
}

/** The sampled document's own indexable tokens, in field order. */
function candidateTokens(snapshot: Record<string, unknown>, searchFields: string[]): string[] {
	const tokens: string[] = [];
	for (const field of searchFields) {
		const value = get(snapshot, field);
		if (value === undefined || value === null) continue;
		for (const token of normalizeForScan(String(value)).split(FLEXSEARCH_TOKEN_BOUNDARY)) {
			if (token.length >= FLEXSEARCH_MIN_TERM_LENGTH && !tokens.includes(token)) {
				tokens.push(token);
			}
		}
	}
	return tokens;
}

/**
 * Builds the till's search indexes eagerly at startup and periodically
 * verifies a sampled document is findable by its own name (#1733).
 *
 * The warmup exists because index construction is otherwise lazy — the first
 * search of a session paid for the whole build. `initSearch` registers the
 * index pipeline, and the pipeline processes its backlog as soon as the RxDB
 * leader is elected, so calling it here IS the build trigger; no search needs
 * to run.
 *
 * The audit exists because the divergence self-check in `engine-query.ts` only
 * detects false HITS. An index returning too few results — the case that loses
 * sales — was previously undetectable. Each audit samples one document and
 * asks the index for it by its own tokens; misses on two distinct documents
 * order a rebuild through the same once-per-session machinery the divergence
 * path uses.
 *
 * Returns a dispose function; timers and subscriptions stop with it.
 */
export function startSearchReadiness(options: {
	engine: RxdbSyncEngine;
	locale: string;
	/** Test seam only — production callers take the defaults. */
	timings?: Partial<{
		warmupDelayMs: number;
		auditInitialDelayMs: number;
		auditIntervalMs: number;
		auditFindTimeoutMs: number;
	}>;
}): () => void {
	const { engine, locale } = options;
	const timings = {
		warmupDelayMs: SEARCH_WARMUP_DELAY_MS,
		auditInitialDelayMs: SEARCH_INDEX_AUDIT_INITIAL_DELAY_MS,
		auditIntervalMs: SEARCH_INDEX_AUDIT_INTERVAL_MS,
		auditFindTimeoutMs: SEARCH_INDEX_AUDIT_FIND_TIMEOUT_MS,
		...options.timings,
	};
	let disposed = false;
	let currentDatabase: AdapterDatabase | null = null;
	const timers = new Set<ReturnType<typeof setTimeout>>();
	/** Streak of missed audits per collection:locale, with the last missed document. */
	const auditFailureStreaks = new Map<string, { count: number; lastUuid: string }>();

	const clearTimers = () => {
		for (const handle of timers) clearTimeout(handle);
		timers.clear();
	};
	const schedule = (task: () => void, ms: number) => {
		if (disposed) return;
		const handle = setTimeout(() => {
			timers.delete(handle);
			task();
		}, ms);
		timers.add(handle);
	};

	const warmCollections = (database: AdapterDatabase) => {
		for (const name of WARMUP_COLLECTIONS) {
			const collection = database.collections[engineCollectionNameFor(name)] as unknown as
				SearchableCollection | undefined;
			if (!collection?.initSearch) continue;
			// initSearch logs its own failures; the warmup only needs to not throw.
			void collection.initSearch(locale, initializationOptionsFor(name)).catch(() => undefined);
		}
	};

	const auditCollection = async (
		database: AdapterDatabase,
		name: (typeof WARMUP_COLLECTIONS)[number]
	) => {
		const collection = database.collections[engineCollectionNameFor(name)] as unknown as
			SearchableCollection | undefined;
		if (!collection?.initSearch) return;
		const initializationOptions = initializationOptionsFor(name);
		const instance = await withTimeout(
			collection.initSearch(locale, initializationOptions),
			timings.auditFindTimeoutMs
		);
		if (instance === AUDIT_TIMED_OUT || instance === null) return;

		// One bounded read, never the whole catalog: count once, then fetch a single
		// document at a random offset (RxDB's default primary-key sort makes the
		// offset deterministic). A large variation catalog must not be materialized
		// every ten minutes just to pick one sample.
		const total = collection.count ? await collection.count().exec() : 0;
		if (total === 0) return;
		const skip = Math.floor(Math.random() * total);
		const [sample] = await collection.find({ skip, limit: 1 }).exec();
		if (!sample) return;
		const snapshot = initializationOptions.documentSnapshot(sample);
		const tokens = candidateTokens(snapshot, initializationOptions.searchFields).slice(
			0,
			SEARCH_INDEX_AUDIT_TOKENS_PER_DOCUMENT
		);
		if (tokens.length === 0) return;

		const key = `${name}:${locale}`;
		for (const token of tokens) {
			const found = await withTimeout(
				(instance as SearchInstance).find(token),
				timings.auditFindTimeoutMs
			);
			// The index cannot answer right now (building, follower tab). Searches are
			// covered by the scan lane; abstaining keeps "not ready" out of "wrong".
			if (found === AUDIT_TIMED_OUT) return;
			if (found.some((document) => document.primary === sample.primary)) {
				auditFailureStreaks.delete(key);
				return;
			}
		}

		const previous = auditFailureStreaks.get(key);
		// A repeat of the SAME document must not extend the streak: one document
		// with only tokenizer-dropped tokens would otherwise reach the threshold
		// alone, defeating the two-distinct-documents safeguard.
		const streak =
			previous && previous.lastUuid === sample.primary
				? previous.count
				: (previous?.count ?? 0) + 1;
		auditFailureStreaks.set(key, { count: streak, lastUuid: sample.primary });
		if (streak < SEARCH_INDEX_AUDIT_FAILURE_THRESHOLD) {
			searchLogger.debug('Search index audit missed a sampled document', {
				context: { collection: name, locale, uuid: sample.primary, tokens },
			});
			return;
		}
		auditFailureStreaks.delete(key);

		const alreadyRebuilt = rebuiltSearchIndexes.has(key);
		searchLogger.error('Search index cannot find an indexed document by its own tokens', {
			code: ERROR_CODES.SEARCH_INDEX_FALSE_MISS,
			showToast: false,
			context: {
				collection: name,
				locale,
				uuid: sample.primary,
				tokens,
				...(alreadyRebuilt ? { alreadyRebuilt: true } : {}),
			},
		});
		if (alreadyRebuilt) return;
		rebuiltSearchIndexes.add(key);
		try {
			await collection.recreateSearch?.(locale);
			const rebuilt = await collection.initSearch(locale, initializationOptions);
			// Rebind every live search subscription to the rebuilt instance.
			if (rebuilt) sharedSearchInstances(key, rebuilt);
		} catch (error) {
			searchLogger.warn('Search index rebuild failed', {
				context: { collection: name, locale, error },
			});
		}
	};

	const auditTick = async () => {
		const database = currentDatabase;
		if (!database || disposed) return;
		for (const name of WARMUP_COLLECTIONS) {
			try {
				await auditCollection(database, name);
			} catch (error) {
				// An audit must never break anything: a failed read here is either
				// transient or will surface through the query path's own recovery.
				searchLogger.debug('Search index audit failed to run', {
					context: { collection: name, locale, error },
				});
			}
			if (disposed || currentDatabase !== database) return;
		}
		schedule(() => void auditTick(), timings.auditIntervalMs);
	};

	const subscription = observeEngineDatabases(engine).subscribe((database) => {
		currentDatabase = database as unknown as AdapterDatabase | null;
		// A database swap (store switch) restarts the cadence against the new scope.
		clearTimers();
		auditFailureStreaks.clear();
		if (!currentDatabase) return;
		const target = currentDatabase;
		schedule(() => warmCollections(target), timings.warmupDelayMs);
		schedule(() => void auditTick(), timings.auditInitialDelayMs);
	});

	return () => {
		disposed = true;
		clearTimers();
		subscription.unsubscribe();
	};
}
