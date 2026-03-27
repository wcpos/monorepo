import * as React from 'react';

import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';

import {
	extractErrorMessage,
	extractWpErrorCode,
} from '@wcpos/hooks/use-http-client/parse-wp-error';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

const syncLogger = getLogger(['wcpos', 'sync', 'push']);

/**
 * Deletion marker fields by line type. WCPOS nulls these to signal the server
 * should delete the item. If the deletion was already processed (stale marker),
 * the ID no longer exists on the order and the server rejects the push.
 */
const DELETION_FIELDS: Record<string, string> = {
	line_items: 'product_id',
	fee_lines: 'name',
	shipping_lines: 'method_id',
	coupon_lines: 'code',
};

/**
 * Strip items with null deletion markers from order JSON before retrying
 * a push that failed because of stale item IDs.
 */
function stripDeletionMarkers(json: Record<string, any>): Record<string, any> {
	const cleaned = { ...json };
	for (const [lineType, field] of Object.entries(DELETION_FIELDS)) {
		const items = cleaned[lineType];
		if (Array.isArray(items)) {
			cleaned[lineType] = items.filter(
				(item: Record<string, any>) => !(field in item) || item[field] != null
			);
		}
	}
	return cleaned;
}

type AnyRxDocument = import('rxdb').RxDocument<any>;

/**
 *
 */
export const usePushDocument = () => {
	const http = useRestHttpClient();
	const t = useT();

	/**
	 * Prepare document data from local database (DB operation)
	 */
	const prepareDocumentData = React.useCallback(
		async (doc: AnyRxDocument) => {
			try {
				const latestDoc = doc.getLatest();
				const json = latestDoc.toJSON();
				return { json, latestDoc };
			} catch (err) {
				syncLogger.error(
					t('common.failed_to_prepare_document_data', {
						error: err instanceof Error ? err.message : String(err),
					}),
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
					t('common.failed_to_send_to_server')
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
		async (latestDoc: AnyRxDocument, serverData: any) => {
			try {
				const parsedData = latestDoc.collection.parseRestResponse(serverData);

				// FIXME: I think this is done automatically by the patch, ie: preSave?
				// I need tests so I can be sure
				// await collection.upsertRefs(parsedData);

				return latestDoc.incrementalPatch(parsedData);
			} catch (err) {
				syncLogger.error(
					t('common.failed_to_update_local_document', {
						error: err instanceof Error ? err.message : String(err),
					}),
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
		async (doc: AnyRxDocument) => {
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

			// Send to server, retrying once if stale deletion markers cause
			// "order item ID not associated with the order" (the IDs were already
			// deleted in a previous sync whose response didn't reach the client).
			let serverData: any;
			try {
				serverData = await sendToServer(endpoint, json, latestDoc.id as number | string);
			} catch (err: any) {
				const errorCode = extractWpErrorCode(err?.response?.data);
				if (errorCode === 'woocommerce_rest_invalid_order_item_id') {
					syncLogger.warn('Stale deletion markers detected, retrying without them', {
						context: { documentId: latestDoc.id, endpoint },
					});
					const cleanedJson = stripDeletionMarkers(json);
					serverData = await sendToServer(endpoint, cleanedJson, latestDoc.id as number | string);
				} else {
					throw err;
				}
			}

			// Update local document with server response
			return await updateLocalDocument(latestDoc, serverData);
		},
		[prepareDocumentData, sendToServer, updateLocalDocument]
	);
};
