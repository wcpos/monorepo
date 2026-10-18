import type { StoreDatabase, UserDatabase } from '@wcpos/database';

import type { Observable } from 'rxjs';

/** Read-only face of the original RxState instance; get stays synchronous. */
export interface StateSlot<T> {
	get(): T;
	get<K extends keyof T>(key: K): T[K] | undefined;
	get$<K extends keyof T>(key: K): Observable<T[K] | undefined>;
	readonly $: Observable<T>;
}

/** The session pointer persisted in userDB's v2 slot under current. */
export interface CurrentSessionIDs {
	siteID?: string;
	wpCredentialsID?: string;
	storeID?: string;
}
export type SessionAppState = StateSlot<{ current: CurrentSessionIDs | null }>;
export type TranslationsState = StateSlot<Record<string, unknown>>;
export type ExtraDataSlot = StateSlot<Record<string, unknown>>;

// Hydration opens these slots before publishing the database. Use the same instances,
// without reopening or wrapping them (translations keys its i18n instance by identity).
export async function commitSessionPointer(
	userDB: UserDatabase,
	ids: CurrentSessionIDs
): Promise<void> {
	await userDB.states.v2.set('current', () => ids);
}

export async function clearSessionPointer(userDB: UserDatabase): Promise<void> {
	await userDB.states.v2.set('current', () => null);
}

/**
 * Write the cache only when the fetched catalogue differs from what is stored. Every
 * rx-state write appends the whole catalogue and wakes the app state's subscribers, and
 * on a rolling ref an unconditional write on every read fed itself: the state grew by
 * tens of megabytes a second until the browser's storage quota was exhausted.
 */
export function cacheTranslations(
	userDB: UserDatabase,
	key: string,
	catalogue: Record<string, string>,
	// The backend compares its fetch-start snapshot, including an absent value.
	comparison = { cached: userDB.states.translations_v2?.[key] as unknown }
): Promise<void> | undefined {
	const translationsState = userDB.states.translations_v2;
	const { cached } = comparison;
	if (JSON.stringify(cached) === JSON.stringify(catalogue)) return;
	return translationsState?.set(key, () => catalogue);
}

export function setExtraData(
	storeDB: StoreDatabase,
	key: 'taxClasses' | 'shippingMethods' | 'orderStatuses' | 'paymentMethods',
	value: unknown
): Promise<void> {
	return storeDB.states.data_v2.set(key, () => value);
}
