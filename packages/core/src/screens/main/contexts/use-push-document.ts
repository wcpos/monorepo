import * as React from 'react';

import { awaitWriteOutcome, useQueryManager } from '@wcpos/query';
import type { LegacyCollectionName } from '@wcpos/query/engine-adapter/collection-map';
import { wrapEngineDocument } from '@wcpos/query/engine-adapter/document-proxy';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { documentRecordId, findEngineResident } from '../hooks/mutations/use-local-mutation';

const syncLogger = getLogger(['wcpos', 'sync', 'push']);

type WriteableCollection = 'orders' | 'products' | 'variations' | 'customers' | 'coupons';
type AnyRxDocument = {
	id?: unknown;
	uuid?: string;
	collection: { name: string };
	getLatest(): AnyRxDocument;
};

const REMOTE_ID_FIELD: Record<WriteableCollection, string> = {
	orders: 'wooOrderId',
	products: 'wooProductId',
	variations: 'wooId',
	customers: 'wooCustomerId',
	coupons: 'wooId',
};

function isWriteableCollection(name: string): name is WriteableCollection {
	return Object.prototype.hasOwnProperty.call(REMOTE_ID_FIELD, name);
}

/**
 * Enqueue the current engine resident through the write plane. The passed legacy document is used
 * only for identity: its fields may be stale after an optimistic resident patch. Order pushes wait
 * for a terminal outcome because checkout requires the rematerialized Woo id.
 */
export const usePushDocument = () => {
	const manager = useQueryManager();
	const t = useT();

	return React.useCallback(
		async (document: AnyRxDocument) => {
			const latest = document.getLatest();
			const collectionName = latest.collection.name;
			if (!isWriteableCollection(collectionName)) {
				throw new Error(`Collection "${collectionName}" is not engine-writeable`);
			}
			const recordId = documentRecordId(latest);
			if (!recordId) throw new Error(`Missing uuid for ${collectionName} push`);

			try {
				const resident = await findEngineResident(manager, collectionName, recordId);
				if (!resident) {
					throw new Error(`Engine resident "${recordId}" is missing from "${collectionName}"`);
				}
				const remoteId =
					typeof resident.get === 'function'
						? resident.get(REMOTE_ID_FIELD[collectionName])
						: (resident as unknown as Record<string, unknown>)[REMOTE_ID_FIELD[collectionName]];
				const receipt = await manager.engine.write({
					collection: collectionName,
					operation: remoteId == null ? 'create' : 'update',
					recordId,
					payload: resident.get('payload') as Record<string, unknown>,
				});

				let currentResident = resident;
				if (collectionName === 'orders') {
					await awaitWriteOutcome(manager.engine, receipt.mutationId);
					const refreshed = await findEngineResident(manager, collectionName, recordId);
					if (!refreshed) {
						throw new Error(`Engine resident "${recordId}" is missing after its write outcome`);
					}
					currentResident = refreshed;
				}

				return wrapEngineDocument(collectionName as LegacyCollectionName, currentResident as never);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				syncLogger.error(t('common.failed_to_send_to_server'), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.TRANSACTION_FAILED,
						documentId: recordId,
						collectionName,
						error: message,
					},
				});
				throw error;
			}
		},
		[manager, t]
	);
};
