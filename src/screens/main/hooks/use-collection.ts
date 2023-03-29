import { useObservableState } from 'observable-hooks';
import { filter, map, tap, debounceTime } from 'rxjs/operators';

import useLocalData from '../../../contexts/local-data/';

/**
 * A helper method to get the latest collection, ie:
 * const collection = useCollection('products');
 *
 * After a clear & sync, the collection will be stale otherwise
 * NOTE: addCollections$ is a custom observable which emits during clear and sync
 */
const useCollection = (key: string) => {
	const { storeDB } = useLocalData();
	const collection = useObservableState(
		storeDB.addCollections$.pipe(
			// debounceTime(100),
			filter((obj) => Object.keys(obj).includes(key)),
			map((obj) => obj[key])
		),
		storeDB.collections[key]
	);
	return collection;
};

export default useCollection;
