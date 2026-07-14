import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import type {
	CouponDocument,
	CustomerDocument,
	OrderDocument,
	ProductDocument,
	ProductVariationDocument,
} from '@wcpos/database';
import { useQueryManager } from '@wcpos/query';
import type { LegacyCollectionName } from '@wcpos/query/engine-adapter/collection-map';
import { wrapEngineDocument } from '@wcpos/query/engine-adapter/document-proxy';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { findEngineResident, insertEngineResident, useLocalMutation } from './use-local-mutation';
import { useT } from '../../../../contexts/translations';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';
import { CollectionKey, useCollection } from '../use-collection';

const mutationLogger = getLogger(['wcpos', 'mutations', 'document']);

type Document =
	| OrderDocument
	| ProductDocument
	| CustomerDocument
	| ProductVariationDocument
	| CouponDocument;
type WriteableCollection = 'orders' | 'products' | 'variations' | 'customers' | 'coupons';

interface Props {
	collectionName: CollectionKey;
	endpoint?: string;
}

function isWriteableCollection(name: string): name is WriteableCollection {
	return ['orders', 'products', 'variations', 'customers', 'coupons'].includes(name);
}

/**
 * Create/update funnel for writeable Woo records. Resident changes are optimistic; engine.write
 * owns durable queue bookkeeping and later acknowledgements/conflicts. A rejected remote outcome
 * remains visible through the engine conflict surface; failure before durable enqueue is rolled back.
 */
export const useMutation = ({ collectionName, endpoint }: Props) => {
	const manager = useQueryManager();
	const t = useT();
	const { collectionLabel } = useCollection(collectionName);
	const { localPatch } = useLocalMutation();

	const handleError = React.useCallback(
		(error: unknown, context?: Record<string, unknown>) => {
			const message = error instanceof Error ? error.message : String(error);
			mutationLogger.error(message, {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.TRANSACTION_FAILED,
					collectionName,
					endpoint,
					operation: 'mutation',
					...context,
				},
			});
		},
		[collectionName, endpoint]
	);

	const handleSuccess = React.useCallback(
		(document: Record<string, unknown>) => {
			mutationLogger.success(t('common.saved_2', { id: document.id, title: collectionLabel }), {
				showToast: true,
				saveToDb: true,
				context: {
					documentId: document.id,
					collectionName,
					collectionLabel,
				},
			});
		},
		[collectionLabel, collectionName, t]
	);

	const patch = React.useCallback(
		async ({ document, data }: { document: Document; data: Record<string, unknown> }) => {
			const result = await localPatch({ document, data: data as never });
			if (result?.document) {
				handleSuccess(result.document as unknown as Record<string, unknown>);
				return result.document;
			}
			handleError(new Error(t('common.not_updated', { title: collectionLabel })), {
				documentId: document.id,
			});
		},
		[collectionLabel, handleError, handleSuccess, localPatch, t]
	);

	const create = React.useCallback(
		async ({
			data,
			requireCustomerId,
		}: {
			data: Record<string, unknown>;
			requireCustomerId?: boolean;
		}) => {
			if (!isWriteableCollection(collectionName)) {
				const error = new Error(`Collection "${collectionName}" is not engine-writeable`);
				handleError(error);
				return;
			}

			try {
				const recordId = uuidv4();
				const now = convertLocalDateToUTCString(new Date());
				const payload = {
					...data,
					...(data.date_created_gmt === undefined ? { date_created_gmt: now } : {}),
					...(data.date_modified_gmt === undefined ? { date_modified_gmt: now } : {}),
				};
				const prepared: {
					resident?: Awaited<ReturnType<typeof insertEngineResident>>;
				} = {};
				const residentPayload: Record<string, unknown> = {};
				await manager.engine.write(
					{
						collection: collectionName,
						operation: 'create',
						recordId,
						payload: residentPayload,
					},
					{
						prepare: async (scope) => {
							prepared.resident = await insertEngineResident({
								manager,
								collection: collectionName,
								recordId,
								payload,
								scope,
							});
							Object.assign(residentPayload, prepared.resident.get('payload'));
						},
						rollback: async () => {
							await prepared.resident?.remove();
						},
					}
				);
				if (!prepared.resident) throw new Error(`Engine resident "${recordId}" was not prepared`);
				if (collectionName === 'customers' && requireCustomerId) {
					await manager.engine.sync('write-drain');
					prepared.resident =
						(await findEngineResident(manager, collectionName, recordId)) ?? undefined;
					if (!prepared.resident || prepared.resident.get('wooCustomerId') == null) {
						throw new Error('Server did not acknowledge customer create');
					}
				}
				const document = wrapEngineDocument(
					collectionName as LegacyCollectionName,
					prepared.resident as never
				);
				handleSuccess(document);
				return document;
			} catch (error) {
				handleError(error);
			}
		},
		[collectionName, handleError, handleSuccess, manager]
	);

	return { patch, create };
};
