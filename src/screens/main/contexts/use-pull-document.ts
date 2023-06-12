import * as React from 'react';

import { isRxDocument } from 'rxdb';

import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../lib/translations';
import useRestHttpClient from '../hooks/use-rest-http-client';

type RxDocument = import('rxdb').RxDocument;

const usePullDocument = () => {
	const http = useRestHttpClient();
	const addSnackbar = useSnackbar();

	return React.useCallback(
		async (id, collection) => {
			let endpoint = collection.name;
			try {
				const { data } = await http.get((endpoint += `/${id}`));
				const parsedData = collection.parseRestResponse(data);
				const success = await collection.upsert(parsedData);
				// if (isRxDocument(success)) {
				// 	addSnackbar({
				// 		message: t('Item synced', { _tags: 'core' }),
				// 	});
				// }
				return success;
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

export default usePullDocument;
