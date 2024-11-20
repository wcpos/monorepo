import * as React from 'react';

import { Toast } from '@wcpos/components/src/toast';
import log from '@wcpos/utils/src/logger';

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
					Toast.show({
						type: 'success',
						text1: t('Item deleted', { _tags: 'core' }),
					});
				}
			} catch (err) {
				log.error(err);
				Toast.show({
					type: 'error',
					text1: t('There was an error: {error}', { _tags: 'core', error: err.message }),
				});
			}
		},
		[http, t]
	);
};

export default useDeleteDocument;
