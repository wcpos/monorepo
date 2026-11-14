import { storeDatabase } from './ensure-local-document';

import type { StoreLocalDatabase } from '../reads/store-local';
import type { RxState } from 'rxdb';

/** The original slot, including its synchronous reads, field observables and set command. */
export type StoreState<T> = RxState<T>;

export async function openStoreState<T>(
	storeDB: StoreLocalDatabase,
	key: string
): Promise<StoreState<T>> {
	return storeDatabase(storeDB).addState<T>(key);
}
