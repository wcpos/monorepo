import * as React from 'react';

import { extractErrorMessage } from '@wcpos/hooks/use-http-client/parse-wp-error';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

const syncLogger = getLogger(['wcpos', 'sync', 'delete']);

type RxCollection = import('rxdb').RxCollection;

interface DeleteDocumentFunction {
	(id: number, collection: RxCollection, params?: any): Promise<void>;
}

const useDeleteDocument = () => {
	const http = useRestHttpClient();
	const t = useT();

	return React.useCallback<DeleteDocumentFunction>(
		async (id, collection, params) => {
			let endpoint = collection.name;
			try {
				const { data } = await http.delete((endpoint += `/${id}`), { params });
				if (data.id === id) {
					syncLogger.success(t('Item deleted', { _tags: 'core' }), {
						showToast: true,
						saveToDb: true,
						context: {
							documentId: id,
							collectionName: collection.name,
						},
					});
				}
			} catch (err: any) {
				// Extract the WooCommerce/WordPress error message from the response
				const serverMessage = extractErrorMessage(
					err?.response?.data,
					t('Failed to delete from server', { _tags: 'core' })
				);
				syncLogger.error(serverMessage, {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.CONNECTION_REFUSED,
						documentId: id,
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

export default useDeleteDocument;
