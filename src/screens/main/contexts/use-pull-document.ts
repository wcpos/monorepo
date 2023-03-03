import * as React from 'react';

import log from '@wcpos/utils/src/logger';

import useRestHttpClient from '../hooks/use-rest-http-client';

type RxDocument = import('rxdb').RxDocument;

const usePullDocument = () => {
	const http = useRestHttpClient();

	return React.useCallback(
		async (id, collection) => {
			let endpoint = collection.name;
			try {
				const { data } = await http.get((endpoint += `/${id}`));
				const parsedData = collection.parseRestResponse(data);
				await collection.upsert(parsedData);
			} catch (err) {
				log.error(err);
			}
		},
		[http]
	);
};

export default usePullDocument;
