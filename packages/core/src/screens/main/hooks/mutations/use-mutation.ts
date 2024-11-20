import * as React from 'react';

import get from 'lodash/get';
import { isRxDocument, RxDocument, RxCollection } from 'rxdb';

import { Toast } from '@wcpos/components/src/toast';
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
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';
import { useCollection, CollectionKey } from '../use-collection';

type Document = OrderDocument | ProductDocument | CustomerDocument | ProductVariationDocument;

interface Props {
	collectionName: CollectionKey;
	endpoint?: string;
}

/**
 * This is a temporary hack. When new docs are created in RxDB, it should fill out the root fields?
 */
function generateEmptyJSON(schema) {
	const result = {};

	if (schema.type === 'object' && schema.properties) {
		for (const key in schema.properties) {
			if (key.startsWith('_')) {
				continue;
			}

			const property = schema.properties[key];
			switch (property.type) {
				case 'string':
					result[key] = '';
					break;
				case 'array':
					result[key] = [];
					break;
				case 'object':
					result[key] = {};
					break;
				case 'boolean':
					result[key] = undefined;
					break;
				case 'number':
				case 'integer':
					result[key] = undefined;
					break;
				default:
					result[key] = undefined;
			}
		}
	}

	return result;
}

/**
 * @FIXME - This sucks, we need a better to mutate local, then queue up a remote create/update
 * And we need to handle the case where the remote create/update fails, and we need to retry
 */
export const useMutation = ({ collectionName, endpoint }: Props) => {
	const manager = useQueryManager();
	const t = useT();
	const { collection, collectionLabel } = useCollection(collectionName);
	const { localPatch } = useLocalMutation();

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
			Toast.show({
				type: 'error',
				text1: t('There was an error: {message}', { _tags: 'core', message }),
			});
		},
		[t]
	);

	/**
	 *
	 */
	const handleSuccess = React.useCallback(
		(doc: RxDocument) => {
			Toast.show({
				type: 'success',
				text1: t('{title} #{id} saved', { _tags: 'core', id: doc.id, title: collectionLabel }),
			});
		},
		[collectionLabel, t]
	);

	/**
	 *
	 */
	const patch = React.useCallback(
		async ({ document, data }: { document: Document; data: Record<string, unknown> }) => {
			const { document: doc, changes } = await localPatch({ document, data });

			try {
				const replicationState = manager.registerCollectionReplication({
					collection,
					endpoint: endpoint ?? collectionName,
				});

				if (!replicationState) {
					throw new Error('replicationState not found');
				}

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
		[
			collection,
			collectionLabel,
			collectionName,
			endpoint,
			handleError,
			handleSuccess,
			localPatch,
			manager,
			t,
		]
	);

	/**
	 *
	 */
	const create = React.useCallback(
		async ({ data }: { data: Record<string, unknown> }) => {
			try {
				// create local document
				const emptyJSON = generateEmptyJSON(collection.schema.jsonSchema);
				const hasCreatedDate = get(collection, 'schema.jsonSchema.properties.date_created_gmt');
				const hasModifiedDate = get(collection, 'schema.jsonSchema.properties.date_modified_gmt');

				if (hasCreatedDate) {
					emptyJSON.date_created_gmt = convertLocalDateToUTCString(new Date());
					if (hasModifiedDate) {
						emptyJSON.date_modified_gmt = emptyJSON.date_created_gmt;
					}
				}
				const doc = await collection.insert({ ...emptyJSON, ...data });

				const replicationState = manager.registerCollectionReplication({
					collection,
					endpoint: endpoint ?? collectionName,
				});

				if (!replicationState) {
					throw new Error('replicationState not found');
				}

				// create remote document
				const updatedDoc = await replicationState.remoteCreate(doc.toJSON());

				if (isRxDocument(updatedDoc)) {
					handleSuccess(updatedDoc);
					return updatedDoc;
				} else {
					doc.getLatest().remove();
					handleError(
						new Error(t('{title} not created', { _tags: 'core', title: collectionLabel }))
					);
				}
			} catch (error) {
				handleError(error);
			}
		},
		[collection, collectionLabel, collectionName, endpoint, handleError, handleSuccess, manager, t]
	);

	return { patch, create };
};
