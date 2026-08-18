import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import type {
	CouponDocument,
	CustomerDocument,
	OrderDocument,
	ProductDocument,
	ProductVariationDocument,
} from '@wcpos/database';
import {
	awaitWriteOutcome,
	COLLECTION_VOCABULARY,
	type LegacyCollectionName,
	useQueryRuntime,
	wrapEngineDocument,
	type WriteableCollection,
} from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { findEngineResident, insertEngineResident, useLocalMutation } from './use-local-mutation';
import { useT } from '../../../../contexts/translations';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';

const mutationLogger = getLogger(['wcpos', 'mutations', 'document']);

type Document =
	OrderDocument | ProductDocument | CustomerDocument | ProductVariationDocument | CouponDocument;

interface Props {
	collectionName: WriteableCollection;
	endpoint?: string;
}

class ActiveScopeChangedTwiceError extends Error {
	public constructor(collection: WriteableCollection) {
		super(`Active engine scope changed twice during ${collection} create`);
		this.name = 'ActiveScopeChangedTwiceError';
	}
}

function isWriteableCollection(name: string): name is WriteableCollection {
	return (
		Object.prototype.hasOwnProperty.call(COLLECTION_VOCABULARY, name) &&
		COLLECTION_VOCABULARY[name as keyof typeof COLLECTION_VOCABULARY].writeable
	);
}

/**
 * Create/update funnel for writeable Woo records. Resident changes are optimistic; engine.write
 * owns durable queue bookkeeping and later acknowledgements/conflicts. A rejected remote outcome
 * remains visible through the engine conflict surface; failure before durable enqueue is rolled back.
 */
export const useMutation = ({ collectionName, endpoint }: Props) => {
	const runtime = useQueryRuntime();
	const t = useT();
	const collectionLabel = React.useMemo(() => {
		switch (collectionName) {
			case 'products':
				return t('common.product');
			case 'variations':
				return t('common.variation');
			case 'customers':
				return t('common.customer');
			case 'orders':
				return t('common.order');
			default:
				return t('common.document');
		}
	}, [collectionName, t]);
	const { localPatch } = useLocalMutation();

	const handleError = React.useCallback(
		(error: unknown, context?: Record<string, unknown>) => {
			const message = error instanceof Error ? error.message : String(error);
			mutationLogger.error(message, {
				showToast: true,
				code: ERROR_CODES.SYNC_UNEXPECTED,
				context: {
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
				let receipt: Awaited<ReturnType<typeof runtime.engine.write>> | undefined;

				for (let attempt = 0; attempt < 2; attempt += 1) {
					const scopeId = runtime.engine.status().activeScopeId;
					resident = await insertEngineResident({
						manager: runtime,
						collection: collectionName,
						recordId,
						payload,
					});
					const residentPayload = resident.get('payload') as Record<string, unknown>;
					let writeError: unknown;
					try {
						receipt = await runtime.engine.write({
							collection: collectionName,
							operation: 'create',
							recordId,
							payload: residentPayload,
							...(awaitRemoteId ? { explicit: true } : {}),
						});
					} catch (error) {
						writeError = error;
					}

					if (runtime.engine.status().activeScopeId !== scopeId) {
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
					await awaitWriteOutcome(runtime.engine, receipt.mutationId);
					const refreshed = await findEngineResident(runtime, collectionName, recordId);
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
		[collectionName, handleError, handleSuccess, runtime]
	);

	return { patch, create };
};
