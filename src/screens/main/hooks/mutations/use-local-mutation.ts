import * as React from 'react';

import useSnackbar from '@wcpos/components/src/snackbar';
import type {
	OrderDocument,
	ProductDocument,
	CustomerDocument,
	ProductVariationDocument,
} from '@wcpos/database';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../../contexts/translations';

type Document = OrderDocument | ProductDocument | CustomerDocument | ProductVariationDocument;

// Generic interface for LocalPatchProps, where T extends Document.
interface LocalPatchProps<T extends Document> {
	document: T;
	data: Partial<T>;
}

/**
 * Hook that provides a function for locally mutating documents and ensuring the date_modified_gmt is updated.
 */
export const useLocalMutation = () => {
	const addSnackbar = useSnackbar();
	const t = useT();

	/**
	 * Function to patch local documents and ensure the date_modified_gmt field is updated.
	 */
	const localPatch = React.useCallback(
		async <T extends Document>({ document, data }: LocalPatchProps<T>) => {
			try {
				data.date_modified_gmt = new Date().toISOString().slice(0, 19);
				const latest = document.getLatest(); // This seems to be required, else rxdb gives conflict error.
				const doc = await latest.patch(data);
				return { changes: data, document: doc };
			} catch (error) {
				log.error('Error patching document', error);
				let message = error.message;
				if (error?.rxdb) {
					message = 'rxdb ' + error.code;
				}
				addSnackbar({
					message: t('There was an error: {message}', { _tags: 'core', message }),
				});
			}
		},
		[addSnackbar, t]
	);

	return { localPatch };
};
