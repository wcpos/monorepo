import type { ReadonlyStoreRecord } from '@wcpos/query/user-db';

type StoreOption = Pick<ReadonlyStoreRecord, 'localID' | 'name' | 'id'>;

/**
 * Dedupe key for the resolved store list.
 *
 * Must cover every field the picker renders, not just the React key. Comparing `localID`
 * alone suppressed the emission for a store whose name or WooCommerce id had changed — and
 * both are read straight off the document during render — so the picker kept showing a
 * stale label with no way to recover short of a remount.
 *
 * Lives here rather than in `store-select.tsx` so it can be tested without pulling the
 * component's UI dependency tree into the suite.
 */
export function storeListsEqual(a: StoreOption[], b: StoreOption[]): boolean {
	return (
		a.length === b.length &&
		a.every(
			(store, index) =>
				store.localID === b[index].localID &&
				store.name === b[index].name &&
				store.id === b[index].id
		)
	);
}

/** Keep single-store sign-in unchanged; only skip a multi-store choice for an offered binding. */
export function resolvePreselectedStore<T extends StoreOption>(
	stores: T[],
	boundStoreId?: number | null
): T | null {
	if (stores.length === 1) return stores[0];
	return (
		stores.find((store) => typeof boundStoreId === 'number' && store.id === boundStoreId) ?? null
	);
}
