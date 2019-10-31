import { useEffect } from 'react';
import { Q } from '@nozbe/watermelondb';
import useDatabase from '../use-database';
import useObservable from '../use-observable';
import useApi from '../use-api';
import sync from './sync';
import syncIds from './sync-ids';

// function initialFetch(type) {
// 	const { storeDB } = useDatabase();

// 	const api = useApi(type);

// 	const collection = storeDB.collections.get(type);
// 	if (api.data) {
// 		const batch = api.data.map((json: any) => {
// 			return collection.prepareCreate((model: Product) => {
// 				Object.keys(json).forEach((key: string) => {
// 					switch (key) {
// 						case 'id':
// 							model.remote_id = json.id;
// 							break;
// 						default:
// 							// @ts-ignore
// 							model[key] = json[key];
// 					}
// 				});
// 			});
// 		});
// 		storeDB.action(async () => await storeDB.batch(...batch));
// 	}
// }

function useData(type, search = '') {
	const { storeDB } = useDatabase();

	const data = useObservable(
		storeDB.collections
			.get(type)
			.query(Q.where('name', Q.like(`%${Q.sanitizeLikeString(search)}%`)))
			.observeWithColumns(['name', 'regular_price']),
		[]
	);
	console.log(data);

	// initial fetch
	// if (data.length === 0) {
	// 	initialFetch(type);
	// }

	// useEffect(() => {
	// 	syncIds(storeDB);
	// }, [storeDB]);

	return { data };
}

export default useData;
