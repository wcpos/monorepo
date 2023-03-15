import * as React from 'react';

import log from '@wcpos/utils/src/logger';

import useRestHttpClient from '../hooks/use-rest-http-client';

type RxDocument = import('rxdb').RxDocument;

const usePushDocument = () => {
	const http = useRestHttpClient();

	/**
	 * TODO - I'm confused about when to use incrementalPatch v patch
	 * sometimes it works, sometimes I get a db error about using the previous version
	 * "Document update conflict. When changing a document you must work on the previous revision"
	 */
	return React.useCallback(
		async (doc: RxDocument) => {
			// const latestDoc = doc.getLatest();
			const latestDoc = doc;
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
				return latestDoc.incrementalPatch(parsedData);
				// return latestDoc.patch(parsedData);
			} catch (err) {
				log.error(err);
			}
		},
		[http]
	);
};

export default usePushDocument;
