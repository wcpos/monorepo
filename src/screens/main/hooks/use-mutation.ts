import * as React from 'react';

import { isRxDocument, RxDocument } from 'rxdb';

import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../contexts/translations';
import { useStoreStateManager } from '../contexts/store-state-manager';

interface Props {
	endpoint?: string;
	onError?: (error: Error) => void;
}

/**
 *
 */
export const useMutation = ({ endpoint, onError }: Props = {}) => {
	const manager = useStoreStateManager();
	const addSnackbar = useSnackbar();
	const t = useT();

	/**
	 *
	 */
	const handleError = React.useCallback(
		(error: Error) => {
			log.error(error);
			if (onError) {
				onError(error);
			}
			addSnackbar({
				message: t('There was an error: {message}', { _tags: 'core', message: error.message }),
			});
		},
		[addSnackbar, onError, t]
	);

	/**
	 *
	 */
	const handleSuccess = React.useCallback(
		(doc: RxDocument) => {
			addSnackbar({
				message: t('Product {id} saved', { _tags: 'core', id: doc.id }),
			});
		},
		[addSnackbar, t]
	);

	/**
	 *
	 */
	const mutate = React.useCallback(
		async ({ document, data }: { document: RxDocument; data: Record<string, unknown> }) => {
			try {
				// update local document
				const latest = document.getLatest();
				const doc = await latest.patch(data);

				// update remote document
				const replicationState = manager.getReplicationState(endpoint || document.collection.name);
				const updatedDoc = await replicationState.remotePatch(doc, data);
				if (isRxDocument(updatedDoc)) {
					handleSuccess(updatedDoc);
					return updatedDoc;
				} else {
					handleError(new Error('Document not updated'));
				}
			} catch (error) {
				handleError(error);
			}
		},
		[endpoint, handleError, handleSuccess, manager]
	);

	return { mutate };
};
