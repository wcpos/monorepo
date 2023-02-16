import * as React from 'react';

import log from '@wcpos/utils/src/logger';

import useRestHttpClient from '../hooks/use-rest-http-client';

type RxDocument = import('rxdb').RxDocument;

const usePushDocument = () => {
	const http = useRestHttpClient();

	return React.useCallback(
		async (doc: RxDocument) => {
			const latestDoc = doc.getLatest();
			const collection = doc.collection;
			let endpoint = collection.name;
			if (latestDoc.id) {
				endpoint += `/${latestDoc.id}`;
			}
			try {
				const { data } = await http.post(endpoint, {
					data: await latestDoc.toPopulatedJSON(),
				});
				//
				const parsedData = latestDoc.collection.parseRestResponse(data);
				await collection.upsertRefs(parsedData);
				return latestDoc.update(parsedData);
			} catch (err) {
				log.error(err);
			}
		},
		[http]
	);
};

export default usePushDocument;
