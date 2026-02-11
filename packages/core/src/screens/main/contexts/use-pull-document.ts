import * as React from 'react';

import get from 'lodash/get';

import { extractErrorMessage } from '@wcpos/hooks/use-http-client/parse-wp-error';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

const syncLogger = getLogger(['wcpos', 'sync', 'pull']);

interface AnyRxCollection {
	name: string;
	parseRestResponse: (data: unknown) => Record<string, unknown>;
	upsert: (data: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Pull document needs to be improved
 * - it should be part of the replication process
 * - it should be reactive, a lot of components need to suspend until the document is pulled
 */
export const usePullDocument = () => {
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
					t('common.failed_to_fetch_from_server')
				);
				syncLogger.error(serverMessage, {
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
		async (data: any, collection: AnyRxCollection, id: number) => {
			try {
				const parsedData = collection.parseRestResponse(data);
				const success = await collection.upsert(parsedData);
				return success;
			} catch (err) {
				syncLogger.error(
					t('common.failed_to_save_to_local_database', {
						error: err instanceof Error ? err.message : String(err),
					}),
					{
						showToast: true,
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.TRANSACTION_FAILED,
							documentId: id,
							collectionName: collection.name,
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
	 * Main pull document function - orchestrates fetch and save
	 */
	return React.useCallback(
		async (id: number, collection: AnyRxCollection, apiEndpoint?: string) => {
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
