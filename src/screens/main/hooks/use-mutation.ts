import * as React from 'react';

import { isRxDocument, RxDocument, RxCollection } from 'rxdb';

import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useReplicationState } from './use-replication-state';
import { useT } from '../../../contexts/translations';
import { useStoreStateManager } from '../contexts/store-state-manager';

interface Props {
	endpoint?: string;
	onError?: (error: Error) => void;
	collection?: RxCollection;
}

/**
 *
 */
export const useMutation = ({ endpoint, onError, collection }: Props = {}) => {
	const manager = useStoreStateManager();
	const addSnackbar = useSnackbar();
	const t = useT();

	/**
	 * @FIXME - this is a hack, if there is no replicationState we need to register one!!
	 */
	const replicationState = useReplicationState({ collectionName: endpoint || collection?.name });

	/**
	 *
	 */
	const handleError = React.useCallback(
		(error: Error) => {
			log.error(error);
			if (onError) {
				onError(error);
			}

			let message = error.message;
			if (error?.rxdb) {
				message = 'rxdb ' + error.code;
			}
			addSnackbar({
				message: t('There was an error: {message}', { _tags: 'core', message }),
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
				message: t('Document {id} saved', { _tags: 'core', id: doc.id }),
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

	/**
	 *
	 */
	const create = React.useCallback(
		async ({ data }: { data: Record<string, unknown> }) => {
			try {
				// create local document
				const doc = await collection.insert(data);

				// create remote document
				const updatedDoc = await replicationState.remoteCreate(doc.toJSON());
				if (isRxDocument(updatedDoc)) {
					handleSuccess(updatedDoc);
					return updatedDoc;
				} else {
					doc.remove();
					handleError(new Error('Document not created'));
				}
			} catch (error) {
				handleError(error);
			}
		},
		[collection, handleError, handleSuccess, replicationState]
	);

	return { mutate, create };
};
