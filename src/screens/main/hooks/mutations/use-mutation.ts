import * as React from 'react';

import { isRxDocument, RxDocument, RxCollection } from 'rxdb';

import useSnackbar from '@wcpos/components/src/snackbar';
import type {
	OrderDocument,
	ProductDocument,
	CustomerDocument,
	ProductVariationDocument,
} from '@wcpos/database';
import { useQueryManager } from '@wcpos/query';
import log from '@wcpos/utils/src/logger';

import { useLocalMutation } from './use-local-mutation';
import { useT } from '../../../../contexts/translations';
import { useCollection, CollectionKey } from '../use-collection';

type Document = OrderDocument | ProductDocument | CustomerDocument | ProductVariationDocument;

interface Props {
	collectionName: CollectionKey;
	endpoint?: string;
}

/**
 *
 */
export const useMutation = ({ collectionName, endpoint }: Props) => {
	const manager = useQueryManager();
	const addSnackbar = useSnackbar();
	const t = useT();
	const { collection, collectionLabel } = useCollection(collectionName);
	const { localPatch } = useLocalMutation();

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

			let message = error.message;
			if (error?.rxdb) {
				message = 'rxdb ' + error.code;
			}
			addSnackbar({
				message: t('There was an error: {message}', { _tags: 'core', message }),
			});
		},
		[addSnackbar, t]
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
		async ({ document, data }: { document: Document; data: Record<string, unknown> }) => {
			const { document: doc, changes } = await localPatch({ document, data });

			try {
				const updatedDoc = await replicationState.remotePatch(doc, changes);
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
		[collectionLabel, handleError, handleSuccess, localPatch, replicationState, t]
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
