import * as React from 'react';
import axios from 'axios';
import useStoreDB from '@wcpos/common/src/hooks/use-store-db';
import useWpCredentials from '@wcpos/common/src/hooks/use-wp-credentials';

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type CollectionNames = 'products';

const fields = {
	products: ['id', 'name'],
};

/**
 * Fetch a full list of IDs available on the server and compare to the local records
 */
const useIdAudit = (collectionName: CollectionNames) => {
	const { storeDB } = useStoreDB() as { storeDB: StoreDatabase };
	// @ts-ignore
	const { wpCredentials } = useWpCredentials();
	const baseURL = 'http://localhost:8888/wp-json/wc/v3/';
	const http = axios.create({
		baseURL,
		headers: { 'X-WCPOS': '1', Authorization: `Bearer ${wpCredentials.jwt}` },
	});

	const collection = storeDB.collections[collectionName];

	if (!collection) {
		throw Error('Collection not found');
	}

	React.useEffect(() => {
		const request = axios.CancelToken.source();

		http
			.get('products', {
				params: { fields: ['id', 'name'], posts_per_page: -1 },
				cancelToken: request.token,
			})
			.then(({ data }: any) => {
				// @ts-ignore
				return collection.auditIdsFromServer(data);
			})
			.catch((err) => {
				console.log(err);
			});

		// cancel server request on unmount
		return () => {
			request.cancel();
		};
	}, [collection, http]);
};

export default useIdAudit;
