import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import useCollection from './use-collection';

type StoreDatabaseCollections = import('@wcpos/database').StoreDatabaseCollections;

/**
 *
 */
const useTotalCount = <K extends keyof StoreDatabaseCollections>(name: K, endpoint: string) => {
	const collection = useCollection(name);
	const ep = endpoint ? endpoint : name;
	const remote = useObservableState(
		// TODO - should make the key consistent
		collection.getLocal$('audit-' + ep).pipe(
			map((result) => {
				const data = result?.toJSON().data;
				return data?.remoteIDs ? data.remoteIDs.length : 0;
			})
		),
		0
	);

	/**
	 * FIXME: count is not working
	 */
	const unSynced = useObservableState(
		collection
			.find({
				selector: {
					id: {
						$exists: false,
					},
				},
			})
			.$.pipe(map((result) => result.length)),
		0
	);

	return remote + unSynced;
};

export default useTotalCount;
