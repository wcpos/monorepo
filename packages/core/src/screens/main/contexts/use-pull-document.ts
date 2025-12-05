import * as React from 'react';

import get from 'lodash/get';
import { isRxDocument } from 'rxdb';

import { extractErrorMessage } from '@wcpos/hooks/use-http-client/parse-wp-error';
import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

type RxDocument = import('rxdb').RxDocument;
type RxCollection = import('rxdb').RxCollection;

/**
 * Pull document needs to be improved
 * - it should be part of the replication process
 * - it should be reactive, a lot of components need to suspend until the document is pulled
 */
const usePullDocument = () => {
	const http = useRestHttpClient();
	const t = useT();

	/**
	 * Fetch document data from server (HTTP operation)
	 */
	const fetchFromServer = React.useCallback(
		async (endpoint: string, id: number) => {
			try {
				const response = await http.get(`${endpoint}/${id}`);
				return get(response, 'data');
			} catch (err: any) {
				// Extract the WooCommerce/WordPress error message from the response
				const serverMessage = extractErrorMessage(
					err?.response?.data,
					t('Failed to fetch from server', { _tags: 'core' })
				);
				log.error(serverMessage, {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.CONNECTION_REFUSED,
						documentId: id,
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
	 * Save document data to local database (DB operation)
	 */
	const saveToLocalDB = React.useCallback(
		async (data: any, collection: RxCollection, id: number) => {
			try {
				const parsedData = collection.parseRestResponse(data);
				const success = await collection.upsert(parsedData);
				return success;
			} catch (err) {
				log.error(t('Failed to save to local database: {error}', { _tags: 'core', error: err.message }), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.TRANSACTION_FAILED,
						documentId: id,
						collectionName: collection.name,
						error: err instanceof Error ? err.message : String(err),
					},
				});
				throw err;
			}
		},
		[t]
	);

	/**
	 * Main pull document function - orchestrates fetch and save
	 */
	return React.useCallback(
		async (id: number, collection: RxCollection, apiEndpoint?: string) => {
			const endpoint = apiEndpoint || collection.name;
			// quick hack to stop the Guest customer error
			const num = Number(id);
			if (!(Number.isInteger(num) && num > 0)) {
				return;
			}

			const data = await fetchFromServer(endpoint, id);
			if (data) {
				return await saveToLocalDB(data, collection, id);
			}
		},
		[fetchFromServer, saveToLocalDB]
	);
};

export default usePullDocument;
