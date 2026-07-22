import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import type {
	CouponDocument,
	CustomerDocument,
	OrderDocument,
	ProductDocument,
	ProductVariationDocument,
} from '@wcpos/database';
import { awaitWriteOutcome, useQueryManager } from '@wcpos/query';
import type { LegacyCollectionName } from '@wcpos/query/engine-compat';
import { wrapEngineDocument } from '@wcpos/query/engine-compat';
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

class ActiveScopeChangedTwiceError extends Error {
	public constructor(collection: WriteableCollection) {
		super(`Active engine scope changed twice during ${collection} create`);
		this.name = 'ActiveScopeChangedTwiceError';
	}
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
					couponCode: document.code,
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
			awaitRemoteId = false,
		}: {
			data: Record<string, unknown>;
			awaitRemoteId?: boolean;
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
				let resident: Awaited<ReturnType<typeof insertEngineResident>> | undefined;
				let receipt: Awaited<ReturnType<typeof manager.engine.write>> | undefined;

				for (let attempt = 0; attempt < 2; attempt += 1) {
					const scopeId = manager.engine.status().activeScopeId;
					resident = await insertEngineResident({
						manager,
						collection: collectionName,
						recordId,
						payload,
					});
					const residentPayload = resident.get('payload') as Record<string, unknown>;
					let writeError: unknown;
					try {
						receipt = await manager.engine.write({
							collection: collectionName,
							operation: 'create',
							recordId,
							payload: residentPayload,
						});
					} catch (error) {
						writeError = error;
					}

					if (manager.engine.status().activeScopeId !== scopeId) {
						await resident.remove();
						if (attempt === 1) {
							throw new ActiveScopeChangedTwiceError(collectionName);
						}
						continue;
					}

					if (writeError) {
						await resident.remove();
						throw writeError;
					}
					break;
				}

				if (!resident || !receipt) {
					throw new Error(`Failed to enqueue ${collectionName} create`);
				}

				let currentResident = resident;
				if (awaitRemoteId) {
					await awaitWriteOutcome(manager.engine, receipt.mutationId);
					const refreshed = await findEngineResident(manager, collectionName, recordId);
					if (!refreshed) {
						throw new Error(`Engine resident "${recordId}" is missing after its write outcome`);
					}
					currentResident = refreshed;
				}
				const document = wrapEngineDocument(
					collectionName as LegacyCollectionName,
					currentResident as never
				);
				handleSuccess(document);
				return document;
			} catch (error) {
				handleError(error);
				if (awaitRemoteId || error instanceof ActiveScopeChangedTwiceError) {
					throw error;
				}
			}
		},
		[collectionName, handleError, handleSuccess, manager]
	);

	return { patch, create };
};
