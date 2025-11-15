import * as React from 'react';

import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

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
				log.success(t('Item deleted', { _tags: 'core' }), {
					showToast: true,
					saveToDb: true,
					context: {
						documentId: id,
						collectionName: collection.name,
					},
				});
			}
		} catch (err) {
			log.error(t('There was an error: {error}', { _tags: 'core', error: err.message }), {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.TRANSACTION_FAILED,
					documentId: id,
					collectionName: collection.name,
					error: err instanceof Error ? err.message : String(err),
				},
			});
		}
		},
		[http, t]
	);
};

export default useDeleteDocument;
