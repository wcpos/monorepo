import * as React from 'react';

import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';

import { extractErrorMessage } from '@wcpos/hooks/use-http-client/parse-wp-error';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

const syncLogger = getLogger(['wcpos', 'sync', 'push']);

type RxDocument = import('rxdb').RxDocument;

/**
 *
 */
const usePushDocument = () => {
	const http = useRestHttpClient();
	const t = useT();

	/**
	 * Prepare document data from local database (DB operation)
	 */
	const prepareDocumentData = React.useCallback(
		async (doc: RxDocument) => {
			try {
				const latestDoc = doc.getLatest();
				const json = latestDoc.toJSON();
				return { json, latestDoc };
			} catch (err) {
				syncLogger.error(
					t('Failed to prepare document data: {error}', { _tags: 'core', error: err.message }),
					{
						showToast: true,
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.TRANSACTION_FAILED,
							documentId: doc.id,
							collectionName: doc.collection.name,
							error: err instanceof Error ? err.message : String(err),
						},
					}
				);
				throw err;
			}
		},
		[t]
	);

	/**
	 * Send document data to server (HTTP operation)
	 */
	const sendToServer = React.useCallback(
		async (endpoint: string, json: any, docId: number | string) => {
			try {
				const response = await http.post(endpoint, json);
				const data = get(response, 'data');

				/**
				 * It's possible for the WC REST API server to return a 200 response but with data = ""
				 * Do a check here to see if the data is empty and if so, throw an error
				 */
				if (isEmpty(data)) {
					throw new Error('Empty response from server');
				}

				return data;
			} catch (err: any) {
				// Extract the WooCommerce/WordPress error message from the response
				const serverMessage = extractErrorMessage(
					err?.response?.data,
					t('Failed to send to server', { _tags: 'core' })
				);
				syncLogger.error(serverMessage, {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.CONNECTION_REFUSED,
						documentId: docId,
						endpoint,
						error: err instanceof Error ? err.message : String(err),
					},
				});
				throw err;
			}
		},
		[http, t]
	);

	/**
	 * Update local document with server response (DB operation)
	 *
	 * TODO - I'm confused about when to use incrementalPatch v patch
	 * sometimes it works, sometimes I get a db error about using the previous version
	 * "Document update conflict. When changing a document you must work on the previous revision"
	 */
	const updateLocalDocument = React.useCallback(
		async (latestDoc: RxDocument, serverData: any) => {
			try {
				const parsedData = latestDoc.collection.parseRestResponse(serverData);

				// FIXME: I think this is done automatically by the patch, ie: preSave?
				// I need tests so I can be sure
				// await collection.upsertRefs(parsedData);

				return latestDoc.incrementalPatch(parsedData);
			} catch (err) {
				syncLogger.error(
					t('Failed to update local document: {error}', { _tags: 'core', error: err.message }),
					{
						showToast: true,
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.TRANSACTION_FAILED,
							documentId: latestDoc.id,
							collectionName: latestDoc.collection.name,
							error: err instanceof Error ? err.message : String(err),
						},
					}
				);
				throw err;
			}
		},
		[t]
	);

	/**
	 * Main push document function - orchestrates prepare, send, and update
	 */
	return React.useCallback(
		async (doc: RxDocument) => {
			const collection = doc.collection;
			let endpoint = collection.name;
			if (collection.name === 'variations') {
				// TODO: make more general, are there other cases?
				endpoint = `products/${doc.parent_id}/variations`;
			}

			// Prepare data from local DB
			const { json, latestDoc } = await prepareDocumentData(doc);

			// Add document ID to endpoint if it exists
			if (latestDoc.id) {
				endpoint += `/${latestDoc.id}`;
			}

			// Send to server
			const serverData = await sendToServer(endpoint, json, latestDoc.id);

			// Update local document with server response
			return await updateLocalDocument(latestDoc, serverData);
		},
		[prepareDocumentData, sendToServer, updateLocalDocument]
	);
};

export default usePushDocument;
