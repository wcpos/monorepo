import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import {
	awaitWriteOutcome,
	COLLECTION_VOCABULARY,
	useQueryRuntime,
	type WriteableCollection,
	WriteOutcomeError,
} from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import {
	documentRecordId,
	findEngineResident,
	insertEngineResident,
	type MutationDocument,
	useLocalMutation,
} from './use-local-mutation';
import { useT } from '../../../../contexts/translations';
import { pushFailureCode } from '../../contexts/push-failure-code';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';

const mutationLogger = getLogger(['wcpos', 'mutations', 'document']);

interface Props {
	collectionName: WriteableCollection;
	endpoint?: string;
	/**
	 * Toast the generic "<Collection> #id saved" on success (default true). A caller that
	 * toasts its own, more specific "Saved {name}" passes false, or one save shows two
	 * success toasts. The success is still logged either way.
	 */
	showSuccessToast?: boolean;
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
export const useMutation = ({ collectionName, endpoint, showSuccessToast = true }: Props) => {
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
			const message = getErrorMessage(error);
			// A store refusal carries the store's own (already localized) sentence, e.g.
			// "An account is already registered with your email address"; the error's
			// message is only the machine `write-rejected for mutation "<uuid>"`. It is the
			// explicit toast title, or the code's generic summary would replace it.
			const rejection =
				error instanceof WriteOutcomeError && error.serverMessage ? error : undefined;
			const serverMessage = rejection?.serverMessage;
			// The log message stays machine text (the store's sentence is localized and would
			// split one Sentry issue per language); the sentence rides the toast and context.
			const logMessage = rejection
				? `${rejection.eventType} (${rejection.reason ?? 'no reason'})`
				: message;
			mutationLogger.error(logMessage, {
				showToast: true,
				code: pushFailureCode(error),
				...(serverMessage ? { toast: { title: serverMessage } } : {}),
				context: {
					collectionName,
					endpoint,
					operation: 'mutation',
					...(rejection ? { error: message, reason: rejection.reason } : {}),
					...context,
				},
			});
		},
		[collectionName, endpoint]
	);

	const handleSuccess = React.useCallback(
		(document: Record<string, unknown>) => {
			const payload = document.payload as Record<string, unknown> | undefined;
			// A create that is only queued has no store id yet: never "#undefined".
			const hasId = payload?.id != null && payload.id !== '' && payload.id !== 0;
			const message = hasId
				? t('common.saved_2', { id: payload?.id, title: collectionLabel })
				: t('common.saved', { name: collectionLabel });
			mutationLogger.success(message, {
				showToast: showSuccessToast,
				context: {
					documentId: payload?.id,
					collectionName,
					collectionLabel,
					couponCode: payload?.code,
				},
			});
		},
		[collectionLabel, collectionName, showSuccessToast, t]
	);

	const patch = React.useCallback(
		async ({ document, data }: { document: MutationDocument; data: Record<string, unknown> }) => {
			const result = await localPatch({ document, data: data as never });
			if (result?.document) {
				handleSuccess(result.document as unknown as Record<string, unknown>);
				return result.document;
			}
			handleError(new Error(t('common.not_updated', { title: collectionLabel })), {
				documentId: documentRecordId(document),
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
					// `toMutableJSON()`, never `resident.get('payload')`: RxDB hands back a
					// *Proxy* for object-valued paths, and a Proxy cannot be structured-cloned
					// into the storage worker — the enqueue dies with "#<Object> could not be
					// cloned". See `residentPayload` in write-intents for the seam that now
					// backstops this.
					const { payload: residentPayload } = resident.toMutableJSON() as {
						payload: Record<string, unknown>;
					};
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
				handleSuccess(currentResident as unknown as Record<string, unknown>);
				return currentResident;
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
