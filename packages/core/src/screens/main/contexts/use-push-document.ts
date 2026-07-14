import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import { useQueryManager } from '@wcpos/query';
import type { LegacyCollectionName } from '@wcpos/query/engine-adapter/collection-map';
import { wrapEngineDocument } from '@wcpos/query/engine-adapter/document-proxy';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import {
	documentRecordId,
	findEngineResident,
	patchEngineResident,
} from '../hooks/mutations/use-local-mutation';

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
		async (document: AnyRxDocument, options?: { requireRemoteId?: boolean }) => {
			const latest = document.getLatest();
			const collectionName = latest.collection.name;
			if (!isWriteableCollection(collectionName)) {
				throw new Error(`Collection "${collectionName}" is not engine-writeable`);
			}
			const recordId = documentRecordId(latest);
			if (!recordId) throw new Error(`Missing uuid for ${collectionName} push`);
			const payload = latest.toJSON() as Record<string, unknown>;
			const operation = Number(payload.id) > 0 ? 'update' : 'create';

			try {
				const prepared: {
					resident?: Awaited<ReturnType<typeof patchEngineResident>>;
					previousResident?: Record<string, unknown>;
				} = {};
				const writePayload: Record<string, unknown> = {};
				await manager.engine.write(
					{
						collection: collectionName,
						operation,
						recordId,
						payload: writePayload,
					},
					{
						prepare: async (scope) => {
							const current = await findEngineResident(manager, collectionName, recordId, scope);
							if (!current) {
								throw new Error(
									`Engine resident "${recordId}" is missing from "${collectionName}"`
								);
							}
							prepared.previousResident = cloneDeep(current.toJSON());
							prepared.resident = await patchEngineResident({
								manager,
								collection: collectionName,
								recordId,
								changes: payload,
								scope,
							});
							Object.assign(writePayload, prepared.resident.get('payload'));
						},
						rollback: async () => {
							if (prepared.resident && prepared.previousResident) {
								await prepared.resident.incrementalModify(() => prepared.previousResident!);
							}
						},
					}
				);
				if (!prepared.resident) throw new Error(`Engine resident "${recordId}" was not prepared`);
				if (operation === 'create' && options?.requireRemoteId) {
					await manager.engine.sync('write-drain');
					prepared.resident = prepared.resident.getLatest();
					if (prepared.resident.get(REMOTE_ID_FIELD[collectionName]) == null) {
						throw new Error(`Server did not acknowledge ${collectionName} create`);
					}
				}
				return wrapEngineDocument(collectionName as LegacyCollectionName, prepared.resident);
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
