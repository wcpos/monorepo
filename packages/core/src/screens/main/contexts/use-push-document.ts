import * as React from 'react';

import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';

import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

type RxDocument = import('rxdb').RxDocument;

/**
 *
 */
const usePushDocument = () => {
	const http = useRestHttpClient();
	const t = useT();

	/**
	 * TODO - I'm confused about when to use incrementalPatch v patch
	 * sometimes it works, sometimes I get a db error about using the previous version
	 * "Document update conflict. When changing a document you must work on the previous revision"
	 */
	return React.useCallback(
		async (doc: RxDocument) => {
			const latestDoc = doc.getLatest();
			// const latestDoc = doc;
			const collection = doc.collection;
			let endpoint = collection.name;
			if (collection.name === 'variations') {
				// TODO: make more general, are there other cases?
				endpoint = `products/${doc.parent_id}/variations`;
			}
			if (latestDoc.id) {
				endpoint += `/${latestDoc.id}`;
			}
			try {
				/**
				 * FIXME: this is a hack to customise the data sent to the server for orders
				 * It's not ideal, but it works for now
				 */
				// const populatedData =
				// 	latestDoc.collection.name === 'orders'
				// 		? await latestDoc.toPopulatedOrderJSON()
				// 		: await latestDoc.toPopulatedJSON();

				const json = latestDoc.toJSON();
				const response = await http.post(endpoint, json);
				const data = get(response, 'data');
				/**
				 * It's possible for the WC REST API server to retrun a 200 response but with data = ""
				 * Do a check here to see if the data is empty and if so, throw an error
				 */
				if (isEmpty(data)) {
					throw new Error('Empty response from server');
				}
				//
				const parsedData = latestDoc.collection.parseRestResponse(data);

				// FIXME: I think this is done automatically by the patch, ie: preSave?
				// I need tests so I can be sure
				// await collection.upsertRefs(parsedData);
			return latestDoc.incrementalPatch(parsedData);
			// return latestDoc.patch(parsedData);
		} catch (err) {
			log.error(t('There was an error: {error}', { _tags: 'core', error: err.message }), {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.TRANSACTION_FAILED,
					documentId: latestDoc.id,
					collectionName: collection.name,
					endpoint,
					error: err instanceof Error ? err.message : String(err),
				},
			});
		}
		},
		[http, t]
	);
};

export default usePushDocument;
