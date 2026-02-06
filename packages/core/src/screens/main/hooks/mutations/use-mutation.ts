import * as React from 'react';

import get from 'lodash/get';
import { isRxDocument, RxDocument } from 'rxdb';

import type {
	CustomerDocument,
	OrderDocument,
	ProductDocument,
	ProductVariationDocument,
} from '@wcpos/database';
import { useQueryManager } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useLocalMutation } from './use-local-mutation';
import { useT } from '../../../../contexts/translations';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';
import { CollectionKey, useCollection } from '../use-collection';

const mutationLogger = getLogger(['wcpos', 'mutations', 'document']);

type Document = OrderDocument | ProductDocument | CustomerDocument | ProductVariationDocument;

interface Props {
	collectionName: CollectionKey;
	endpoint?: string;
}

/**
 * This is a temporary hack. When new docs are created in RxDB, it should fill out the root fields?
 */
function generateEmptyJSON(schema: any): Record<string, any> {
	const result: Record<string, any> = {};

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
 * Hook for creating and updating documents with optimistic local updates and server sync.
 *
 * Flow:
 * 1. Apply changes locally (optimistic update)
 * 2. Send to server
 * 3. Server response becomes source of truth (overwrites local)
 * 4. On error: rollback local changes (patch) or remove local doc (create)
 */
export const useMutation = ({ collectionName, endpoint }: Props) => {
	const manager = useQueryManager();
	const t = useT();
	const { collection, collectionLabel } = useCollection(collectionName);
	const { localPatch } = useLocalMutation();

	/**
	 * Handle mutation errors with appropriate error codes
	 */
	const handleError = React.useCallback(
		(error: Error | any, context?: Record<string, unknown>) => {
			let errorCode: string = ERROR_CODES.TRANSACTION_FAILED;
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
						errorCode = ERROR_CODES.TRANSACTION_FAILED;
						message = `Database error: ${error.code || 'unknown'}`;
				}
			}

			mutationLogger.error(message, {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode,
					collectionName,
					endpoint,
					operation: 'mutation',
					...context,
				},
			});
		},
		[collectionName, endpoint]
	);

	/**
	 * Handle successful mutations
	 */
	const handleSuccess = React.useCallback(
		(doc: RxDocument) => {
			mutationLogger.success(t('common.saved_2', { id: doc.id, title: collectionLabel }), {
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
	 * Patch an existing document.
	 *
	 * 1. Save original values for rollback
	 * 2. Apply changes locally (optimistic)
	 * 3. Send to server
	 * 4. Server response overwrites local (source of truth)
	 * 5. On error: rollback to original values
	 */
	const patch = React.useCallback(
		async ({ document, data }: { document: Document; data: Record<string, unknown> }) => {
			// Save original values for potential rollback
			const originalValues: Record<string, unknown> = {};
			for (const key of Object.keys(data)) {
				const rootKey = key.split('.')[0];
				if (!(rootKey in originalValues)) {
					originalValues[rootKey] = (document as any)[rootKey];
				}
			}

			// Apply optimistic local update
			const result = await localPatch({ document, data });
			if (!result) {
				return; // localPatch already handles/logs errors
			}

			const { document: doc, changes } = result;

			try {
				const replicationState = manager.registerCollectionReplication({
					collection,
					endpoint: endpoint ?? collectionName,
				});

				if (!replicationState) {
					throw new Error('replicationState not found');
				}

				// Send to server - server response becomes source of truth
				const updatedDoc = await replicationState.remotePatch(doc, changes);

				if (isRxDocument(updatedDoc)) {
					handleSuccess(updatedDoc);
					return updatedDoc;
				} else {
					// Server returned an error or invalid response - rollback local changes
					await doc.getLatest().incrementalPatch(originalValues);
					handleError(new Error(t('common.not_updated', { title: collectionLabel })), {
						documentId: doc.id,
					});
				}
			} catch (error) {
				// Rollback local changes on error
				try {
					await doc.getLatest().incrementalPatch(originalValues);
				} catch (rollbackError) {
					mutationLogger.debug('Failed to rollback local changes', {
						context: { documentId: doc.id, error: String(rollbackError) },
					});
				}
				handleError(error, { documentId: doc.id });
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
	 * Create a new document.
	 *
	 * 1. Create locally with generated fields
	 * 2. Send to server
	 * 3. Server response overwrites local (source of truth - includes server-generated ID)
	 * 4. On error: remove local document
	 */
	const create = React.useCallback(
		async ({ data }: { data: Record<string, unknown> }) => {
			let localDoc: RxDocument | null = null;

			try {
				// Create local document with empty fields and provided data
				const emptyJSON = generateEmptyJSON(collection.schema.jsonSchema);
				const hasCreatedDate = get(collection, 'schema.jsonSchema.properties.date_created_gmt');
				const hasModifiedDate = get(collection, 'schema.jsonSchema.properties.date_modified_gmt');

				if (hasCreatedDate) {
					emptyJSON.date_created_gmt = convertLocalDateToUTCString(new Date());
					if (hasModifiedDate) {
						emptyJSON.date_modified_gmt = emptyJSON.date_created_gmt;
					}
				}

				localDoc = await collection.insert({ ...emptyJSON, ...data });

				const replicationState = manager.registerCollectionReplication({
					collection,
					endpoint: endpoint ?? collectionName,
				});

				if (!replicationState) {
					throw new Error('replicationState not found');
				}

				// Send to server - server response becomes source of truth (includes real ID)
				const serverDoc = await replicationState.remoteCreate(localDoc.toJSON());

				if (isRxDocument(serverDoc)) {
					handleSuccess(serverDoc);
					return serverDoc;
				} else {
					// Server returned an error or invalid response - remove local document
					await localDoc.getLatest().remove();
					handleError(new Error(t('common.not_created', { title: collectionLabel })));
				}
			} catch (error) {
				// Remove local document on error
				if (localDoc) {
					try {
						await localDoc.getLatest().remove();
					} catch (removeError) {
						mutationLogger.debug('Failed to remove local document after create error', {
							context: { error: String(removeError) },
						});
					}
				}
				handleError(error);
			}
		},
		[collection, collectionLabel, collectionName, endpoint, handleError, handleSuccess, manager, t]
	);

	return { patch, create };
};
