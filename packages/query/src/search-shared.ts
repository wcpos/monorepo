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
	find(): { exec(): Promise<EngineRxDocument[]> };
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

/** FlexSearch's own notion of a word boundary, mirrored wherever we tokenize like it. */
export const FLEXSEARCH_TOKEN_BOUNDARY = /[\p{Z}\p{S}\p{P}\p{C}]+/u;

/**
 * Composition-form-insensitive, case-insensitive — but deliberately NOT
 * accent-insensitive: the index is accent-exact today, and a fallback path
 * that matched more loosely than the index would make results flicker when the
 * indexed answer swaps in. Accent-insensitivity across BOTH paths is #1732.
 */
export function normalizeForScan(value: string): string {
	return value.normalize('NFKC').toLowerCase();
}
