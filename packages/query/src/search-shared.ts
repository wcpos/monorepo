import { BehaviorSubject } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';

import type { EngineRxDocument } from './engine-adapter/execute-query';
import type { Observable } from 'rxjs';

export type SearchInstance = {
	collection: { $: Observable<unknown> };
	find(term: string): Promise<EngineRxDocument[]>;
};

export type SearchableCollection = {
	$: Observable<unknown>;
	options?: { searchFields?: string[] };
	find(query?: Record<string, unknown>): { exec(): Promise<EngineRxDocument[]> };
	count?(): { exec(): Promise<number> };
	initSearch(
		locale: string,
		options: {
			searchFields?: string[];
			documentSnapshot(document: EngineRxDocument): Record<string, unknown>;
		}
	): Promise<SearchInstance | null>;
	recreateSearch?(locale: string): Promise<unknown>;
};

export const searchLogger = getLogger(['wcpos', 'query', 'search']);

/**
 * One rebuild per collection:locale per session, shared by every path that can
 * order one (the divergence self-check and the false-miss audit). A rebuild
 * cannot cure a deterministic cause — the same defect would order the same
 * rebuild forever — so recurrences after the one attempt are logged, not acted on.
 */
export const rebuiltSearchIndexes = new Set<string>();

/**
 * One subject per collection:locale, shared by every active subscription, so a
 * rebuild rebinds ALL of them — `recreateSearch` destroys the instance the
 * others still hold. Entries are never deleted: the population is bounded by
 * collections × locales, and a live subject must outlast any one subscription.
 */
const searchInstanceSubjects = new Map<string, BehaviorSubject<SearchInstance>>();

export function sharedSearchInstances(
	key: string,
	instance: SearchInstance
): BehaviorSubject<SearchInstance> {
	const existing = searchInstanceSubjects.get(key);
	if (!existing) {
		const subject = new BehaviorSubject(instance);
		searchInstanceSubjects.set(key, subject);
		return subject;
	}
	// A newer instance (fresh initSearch after a database swap or rebuild) supersedes the held one.
	if (existing.value !== instance) existing.next(instance);
	return existing;
}

// Folding note: every plane that matches text — the index's encoder, the scan
// fallback, the false-hit verifier, and the audit's token probes — must use
// the ONE shared `foldSearchText`/`FLEXSEARCH_TOKEN_BOUNDARY` from
// `@wcpos/sync-core` (#1732). A plane that folds differently makes results
// appear from one path and vanish when another takes over.
