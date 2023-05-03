import { useObservableState, useObservable } from 'observable-hooks';
import { of } from 'rxjs';
import {
	filter,
	map,
	tap,
	switchMap,
	startWith,
	mergeWith,
	distinctUntilChanged,
} from 'rxjs/operators';

import useLocalData from '../../../contexts/local-data/';

type StoreDatabaseCollections = import('@wcpos/database').StoreDatabaseCollections;

/**
 * A helper method to get the latest collection, ie:
 * const collection = useCollection('products');
 *
 * After a clear & sync, the collection will be stale otherwise
 * NOTE: addCollections$ is a custom observable which emits during clear and sync
 */
const useCollection = <K extends keyof StoreDatabaseCollections>(key: K) => {
	const { storeDB } = useLocalData();

	const collection$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([currentStoreDB]) => {
					return of(currentStoreDB.collections[key]).pipe(
						mergeWith(
							currentStoreDB.addCollections$.pipe(
								filter((obj) => Object.keys(obj).includes(key)),
								map((obj) => obj[key])
							)
						)
					);
				})
			),
		[storeDB]
	);

	const collection = useObservableState(collection$, storeDB.collections[key]);

	return collection;
};

export default useCollection;
