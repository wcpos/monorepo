import * as React from 'react';

import { isRxDocument, RxDocument, RxCollection } from 'rxdb';

import useSnackbar from '@wcpos/components/src/snackbar';
import { useQueryManager } from '@wcpos/query';
import log from '@wcpos/utils/src/logger';

import { useCollection, CollectionKey } from './use-collection';
import { useT } from '../../../contexts/translations';

interface Props {
	collectionName: CollectionKey;
	endpoint?: string;
	onError?: (error: Error) => void;
}

/**
 *
 */
export const useMutation = ({ collectionName, endpoint, onError }: Props) => {
	const manager = useQueryManager();
	const addSnackbar = useSnackbar();
	const t = useT();
	const { collection, collectionLabel } = useCollection(collectionName);

	/**
	 * If there is no replicationState we need to register one
	 */
	const replicationState = manager.registerCollectionReplication({
		collection,
		endpoint: endpoint ?? collectionName,
	});

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
				message: t('{title} #{id} saved', { _tags: 'core', id: doc.id, title: collectionLabel }),
			});
		},
		[addSnackbar, collectionLabel, t]
	);

	/**
	 *
	 */
	const patch = React.useCallback(
		async ({ document, data }: { document: RxDocument; data: Record<string, unknown> }) => {
			try {
				// update local document
				const latest = document.getLatest();
				const doc = await latest.patch(data);

				// update remote document
				const updatedDoc = await replicationState.remotePatch(doc, data);
				if (isRxDocument(updatedDoc)) {
					handleSuccess(updatedDoc);
					return updatedDoc;
				} else {
					handleError(
						new Error(t('{title} not updated', { _tags: 'core', title: collectionLabel }))
					);
				}
			} catch (error) {
				handleError(error);
			}
		},
		[collectionLabel, handleError, handleSuccess, replicationState, t]
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
					handleError(
						new Error(t('{title} not created', { _tags: 'core', title: collectionLabel }))
					);
				}
			} catch (error) {
				handleError(error);
			}
		},
		[collection, collectionLabel, handleError, handleSuccess, replicationState, t]
	);

	return { patch, create };
};
