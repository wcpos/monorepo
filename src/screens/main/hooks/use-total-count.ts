import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
// import { map } from 'rxjs/operators';

// import useCollection from './use-collection';

type StoreDatabaseCollections = import('@wcpos/database').StoreDatabaseCollections;

/**
 * TODO: use replicationState.total$ and combine remote with unsynced there
 */
const useTotalCount = <K extends keyof StoreDatabaseCollections>(replicationState) => {
	// const { collection } = useCollection(name);
	const remoteIDs = useObservableState(replicationState ? replicationState.remoteIDs$ : of([]), []);
	return remoteIDs.length;

	/**
	 * FIXME: count is not working
	 */
	// const unSynced = useObservableState(
	// 	collection
	// 		.find({
	// 			selector: {
	// 				id: {
	// 					$exists: false,
	// 				},
	// 			},
	// 		})
	// 		.$.pipe(map((result) => result.length)),
	// 	0
	// );

	// return remote + unSynced;
};

export default useTotalCount;
