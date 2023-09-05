import * as React from 'react';

import get from 'lodash/get';
import { isRxDocument } from 'rxdb';

import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../contexts/translations';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';

type RxDocument = import('rxdb').RxDocument;
type RxCollection = import('rxdb').RxCollection;

/**
 * Pull document needs to be improved
 * - it should be part of the replication process
 * - it should be reactive, a lot of components need to suspend until the document is pulled
 */
const usePullDocument = () => {
	const http = useRestHttpClient();
	const addSnackbar = useSnackbar();
	const t = useT();

	return React.useCallback(
		async (id: number, collection: RxCollection, apiEndpoint?: string) => {
			let endpoint = apiEndpoint || collection.name;
			// quick hack to stop the Guest customer error
			const num = Number(id);
			if (!(Number.isInteger(num) && num > 0)) {
				return;
			}
			try {
				const response = await http.get((endpoint += `/${id}`));
				const data = get(response, 'data');
				if (data) {
					const parsedData = collection.parseRestResponse(data);
					const success = await collection.upsert(parsedData);
					// if (isRxDocument(success)) {
					// 	addSnackbar({
					// 		message: t('Item synced', { _tags: 'core' }),
					// 	});
					// }
					return success;
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

export default usePullDocument;
