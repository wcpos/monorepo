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

/** FlexSearch's own notion of a word boundary, mirrored wherever we tokenize like it. */
export const FLEXSEARCH_TOKEN_BOUNDARY = /[\p{Z}\p{S}\p{P}\p{C}]+/u;

/**
 * Lowercase ONLY, exactly what FlexSearch's encoder does under our config
 * (probed 2026-08-31: `preset: 'performance', tokenize: 'full'` matches
 * case-insensitively but performs no Unicode normalization whatsoever — an NFC
 * query does not match an NFD-stored name, and no diacritics are stripped).
 * A fallback that matched more loosely than the index would make results
 * appear from the scan and vanish when the indexed answer swaps in, and would
 * let the audit probe tokens the index never stored. Normalization-insensitive
 * matching is #1732 and must land in BOTH paths together, with an index
 * version bump.
 */
export function normalizeForScan(value: string): string {
	return value.toLowerCase();
}
