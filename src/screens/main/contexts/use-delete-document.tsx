import * as React from 'react';

import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../contexts/translations';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

type RxCollection = import('rxdb').RxCollection;

interface DeleteDocumentFunction {
	(id: number, collection: RxCollection, params?: any): Promise<void>;
}

const useDeleteDocument = () => {
	const http = useRestHttpClient();
	const addSnackbar = useSnackbar();
	const t = useT();

	return React.useCallback<DeleteDocumentFunction>(
		async (id, collection, params) => {
			let endpoint = collection.name;
			try {
				const { data } = await http.delete((endpoint += `/${id}`), { params });
				if (data.id === id) {
					addSnackbar({
						message: t('Item deleted', { _tags: 'core' }),
					});
				}
			} catch (err) {
				log.error(err);
				addSnackbar({
					message: t('There was an error: {error}', { _tags: 'core', error: err.message }),
					type: 'critical',
				});
			}
		},
		[addSnackbar, http, t]
	);
};

export default useDeleteDocument;
