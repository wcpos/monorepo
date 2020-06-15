import { Q } from '@nozbe/watermelondb';
import { filter, map, tap } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import useAppState from '../use-app-state';
import { syncIds } from '../../services/wc-api';

type DataType = 'products' | 'orders' | 'customers';

/**
 *
 * @param section
 */
const useUI = (type: DataType) => {
	const [{ storeDB, wpUser, site }] = useAppState();
	const dataCollection = storeDB.collections.get(type);

	// @TODO query observable combine with database query
	const data$ = dataCollection
		.query(Q.where('name', Q.like(`%${Q.sanitizeLikeString('')}%`)))
		.observe()
		.pipe(
			filter((data) => {
				if (data.length > 0) {
					return true;
				}
				syncIds(dataCollection, wpUser, site);
			})
		);

	return new ObservableResource(data$);
};

export default useUI;
