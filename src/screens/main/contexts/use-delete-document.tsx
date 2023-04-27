import * as React from 'react';

import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../lib/translations';
import useRestHttpClient from '../hooks/use-rest-http-client';

type RxDocument = import('rxdb').RxDocument;

const useDeleteDocument = () => {
	const http = useRestHttpClient();
	const addSnackbar = useSnackbar();

	return React.useCallback(
		async (id, collection) => {
			let endpoint = collection.name;
			try {
				const { data } = await http.del((endpoint += `/${id}`));
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
		[addSnackbar, http]
	);
};

export default useDeleteDocument;
