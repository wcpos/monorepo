import * as React from 'react';

import { useQueryManager } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { documentRecordId, patchEngineResident } from '../hooks/mutations/use-local-mutation';

const syncLogger = getLogger(['wcpos', 'sync', 'push']);

type WriteableCollection = 'orders' | 'products' | 'variations' | 'customers' | 'coupons';
type AnyRxDocument = {
	id?: unknown;
	uuid?: string;
	collection: { name: string };
	getLatest(): AnyRxDocument;
	toJSON(): Record<string, unknown>;
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
 * Enqueue the document snapshot through the engine write plane. The resident was already updated
 * optimistically by the editing funnel; this final patch refreshes it from the caller's latest
 * snapshot before enqueueing. Push outcomes reconcile asynchronously through the engine, and
 * conflicts remain durable instead of rolling the optimistic snapshot back.
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
			const payload = latest.toJSON() as Record<string, unknown>;

			try {
				const resident = await patchEngineResident({
					manager,
					collection: collectionName,
					recordId,
					changes: payload,
				});
				const remoteId =
					typeof resident.get === 'function'
						? resident.get(REMOTE_ID_FIELD[collectionName])
						: (resident as unknown as Record<string, unknown>)[REMOTE_ID_FIELD[collectionName]];
				await manager.engine.write({
					collection: collectionName,
					operation: remoteId == null ? 'create' : 'update',
					recordId,
					payload: resident.get('payload') as Record<string, unknown>,
				});
				return latest;
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
