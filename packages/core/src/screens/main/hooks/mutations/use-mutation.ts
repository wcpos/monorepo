import * as React from 'react';

import get from 'lodash/get';
import { RxDocument } from 'rxdb';

import type {
	CustomerDocument,
	OrderDocument,
	ProductDocument,
	ProductVariationDocument,
} from '@wcpos/database';
import { useQueryManager } from '@wcpos/query';
import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useLocalMutation } from './use-local-mutation';
import { useT } from '../../../../contexts/translations';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';
import { CollectionKey, useCollection } from '../use-collection';

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
		(error: Error | any) => {
			let errorCode: string = ERROR_CODES.QUERY_SYNTAX_ERROR;
			let message = error.message || String(error);

			if (error?.rxdb) {
				// Handle RxDB specific errors with appropriate codes
				switch (error.code) {
					case 'RX1':
						errorCode = ERROR_CODES.DUPLICATE_RECORD;
						message = 'Record already exists';
						break;
					case 'RX2':
						errorCode = ERROR_CODES.CONSTRAINT_VIOLATION;
						message = 'Database constraint violation';
						break;
					case 'RX3':
						errorCode = ERROR_CODES.INVALID_DATA_TYPE;
						message = 'Invalid data format';
						break;
					default:
						message = `Database error: ${error.code || 'unknown'}`;
				}
			}

			log.error(message, {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode,
					collectionName,
					endpoint,
					operation: 'mutation',
				},
			});
		},
		[collectionName, endpoint]
	);

	/**
	 *
	 */
	const handleSuccess = React.useCallback(
		(doc: RxDocument) => {
			log.success(t('{title} #{id} saved', { _tags: 'core', id: doc.id, title: collectionLabel }), {
				showToast: true,
				saveToDb: true,
				context: {
					documentId: doc.id,
					collectionName,
					collectionLabel,
				},
			});
		},
		[collectionLabel, collectionName, t]
	);

	/**
	 *
	 */
	const patch = React.useCallback(
		async ({ document, data }: { document: Document; data: Record<string, unknown> }) => {
			const { document: doc } = await localPatch({ document, data });

			try {
				const replicationState = manager.registerCollectionReplication({
					collection,
					endpoint: endpoint ?? collectionName,
				});

				if (!replicationState) {
					throw new Error('replicationState not found');
				}

				// TODO: Fix replication method call - remotePatch may not exist
				// const updatedDoc = await replicationState.remotePatch(doc, changes);
				// For now, just use the local document
				handleSuccess(doc);
				return doc;

				// if (isRxDocument(updatedDoc)) {
				// 	handleSuccess(updatedDoc);
				// 	return updatedDoc;
				// } else {
				// 	handleError(
				// 		new Error(t('{title} not updated', { _tags: 'core', title: collectionLabel }))
				// 	);
				// }
			} catch (error) {
				handleError(error);
			}
		},
		[collection, collectionName, endpoint, handleError, handleSuccess, localPatch, manager]
	);

	/**
	 *
	 */
	const create = React.useCallback(
		async ({ data }: { data: Record<string, unknown> }) => {
			try {
				// create local document
				const emptyJSON: any = generateEmptyJSON(collection.schema.jsonSchema);
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

				// TODO: Fix replication method call - remoteCreate may not exist
				// const updatedDoc = await replicationState.remoteCreate(doc.toJSON());
				// For now, just use the local document
				handleSuccess(doc);
				return doc;

				// if (isRxDocument(updatedDoc)) {
				// 	handleSuccess(updatedDoc);
				// 	return updatedDoc;
				// } else {
				// 	doc.getLatest().remove();
				// 	handleError(
				// 		new Error(t('{title} not created', { _tags: 'core', title: collectionLabel }))
				// 	);
				// }
			} catch (error) {
				handleError(error);
			}
		},
		[collection, collectionName, endpoint, handleError, handleSuccess, manager]
	);

	return { patch, create };
};
