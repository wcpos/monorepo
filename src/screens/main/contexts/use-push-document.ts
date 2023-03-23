import * as React from 'react';

import isEmpty from 'lodash/isEmpty';

import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../lib/translations';
import useRestHttpClient from '../hooks/use-rest-http-client';

type RxDocument = import('rxdb').RxDocument;

/**
 *
 */
const usePushDocument = () => {
	const http = useRestHttpClient();
	const addSnackbar = useSnackbar();

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
			if (latestDoc.id) {
				endpoint += `/${latestDoc.id}`;
			}
			try {
				/**
				 * FIXME: this is a hack to customise the data sent to the server for orders
				 * It's not ideal, but it works for now
				 */
				const populatedData =
					latestDoc.collection.name === 'orders'
						? await latestDoc.toPopulatedOrderJSON()
						: await latestDoc.toPopulatedJSON();

				const { data } = await http.post(endpoint, {
					data: populatedData,
				});
				/**
				 * It's possible for the WC REST API server to retrun a 200 response but with data = ""
				 * Do a check here to see if the data is empty and if so, throw an error
				 */
				if (isEmpty(data)) {
					throw new Error('Empty response from server');
				}
				//
				const parsedData = latestDoc.collection.parseRestResponse(data);

				// FIXME: I think this is done automaticallu by the patch, ie: preSave?
				// I need tests so I can be sure
				await collection.upsertRefs(parsedData);
				return latestDoc.incrementalPatch(parsedData);
				// return latestDoc.patch(parsedData);
			} catch (err) {
				log.error(err);
				addSnackbar({
					message: t('There was an error: {error}', { _tags: 'core', error: err.message }),
					type: 'critical',
				});
			}
		},
		[addSnackbar, http]
	);
};

export default usePushDocument;
