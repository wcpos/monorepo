import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';
import get from 'lodash/get';
import set from 'lodash/set';

import type {
	CustomerDocument,
	OrderDocument,
	ProductDocument,
	ProductVariationDocument,
} from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../contexts/translations';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';

const mutationLogger = getLogger(['wcpos', 'mutations', 'local']);

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
	const t = useT();

	/**
	 * Function to patch local documents and ensure the date_modified_gmt field is updated.
	 */
	const localPatch = React.useCallback(
		async <T extends Document>({ document, data }: LocalPatchProps<T>) => {
			try {
				// check schema for date_modified_gmt field
				const hasDate = get(document, 'collection.schema.jsonSchema.properties.date_modified_gmt');

				if (hasDate) {
					data.date_modified_gmt = convertLocalDateToUTCString(new Date());
				}

				const latest = document.getLatest(); // This seems to be required, else rxdb gives conflict error.

				/**
				 * Data from Form component can be nested in dot notation, so we need use lodash set.
				 * - This is a bit messy, but I'm not sure how use to handle things like arrays using patch.
				 * - We want to use patch so we can minimal changes locally and then sync patch to server.
				 *
				 * NOTE: rxdb only sets the root key
				 */
				const changes = {};
				const doc = await latest.incrementalModify((old) => {
					Object.keys(data).forEach((key) => {
						const path = key.split('.');
						const root = path.shift();
						if (path.length === 0) {
							old[root] = data[key];
							changes[root] = data[key];
						} else {
							// Handle nested keys for both objects and arrays
							if (Array.isArray(old[root])) {
								const updatedArray = cloneDeep(old[root]);
								set(updatedArray, path, data[key]);
								old[root] = updatedArray;
								changes[root] = updatedArray;
							} else {
								const updatedObject = set(cloneDeep(old[root]), path, data[key]);
								old[root] = updatedObject;
								changes[root] = updatedObject;
							}
						}
					});
					return old;
				});

				return { changes, document: doc };
			} catch (error) {
				let message = error.message;
				let errorCode = ERROR_CODES.TRANSACTION_FAILED;
				if (error?.rxdb) {
					message = 'rxdb ' + error.code;
					errorCode = ERROR_CODES.CONSTRAINT_VIOLATION;
				}
				mutationLogger.error(t('There was an error: {message}', { message }), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode,
						documentId: document.id,
						collectionName: document.collection?.name,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			}
		},
		[t]
	);

	return { localPatch };
};
