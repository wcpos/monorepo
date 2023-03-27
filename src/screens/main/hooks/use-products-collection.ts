import { useObservableState } from 'observable-hooks';
import { filter, map, tap, debounceTime } from 'rxjs/operators';

import useLocalData from '../../../contexts/local-data/';

const useProductsCollection = () => {
	const { storeDB } = useLocalData();
	const collection = useObservableState(
		storeDB.addCollections$.pipe(
			// debounceTime(100),
			filter((obj) => Object.keys(obj).includes('products')),
			map((obj) => obj.products)
		),
		storeDB.collections.products
	);
	return collection;
};

export default useProductsCollection;
