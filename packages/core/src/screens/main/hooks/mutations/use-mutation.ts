import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import {
	awaitWriteOutcome,
	COLLECTION_VOCABULARY,
	useQueryRuntime,
	type WriteableCollection,
	WriteOutcomeError,
} from '@wcpos/query';
import { getLogger, markErrorReported } from '@wcpos/utils/logger';

import {
	findEngineResident,
	insertEngineResident,
	type MutationDocument,
	useLocalMutation,
} from './use-local-mutation';
import { useT } from '../../../../contexts/translations';
import { reportPushFailure } from '../../contexts/push-failure-code';
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
		(error: unknown) => {
			// A store refusal carries the store's own (already localized) sentence, e.g.
			// "An account is already registered with your email address", which becomes
			// the toast title. The log message stays machine text (the store's sentence
			// is localized and would split one Sentry issue per language).
			const logMessage =
				error instanceof WriteOutcomeError
					? `${error.eventType} (${error.reason ?? 'no reason'})`
					: `${collectionName} create failed`;
			reportPushFailure(mutationLogger, logMessage, error, {
				// A timed-out create is still queued and may yet land: "re-enter and
				// save" here is how a slow store got a duplicate customer.
				stillSendingTitle: t('common.still_sending', { title: collectionLabel }),
				context: { collectionName, endpoint, operation: 'mutation' },
			});
		},
		[collectionLabel, collectionName, endpoint, t]
	);

	const handleSuccess = React.useCallback(
		(document: Record<string, unknown>) => {
			const payload = document.payload as Record<string, unknown> | undefined;
			mutationLogger.success(t('common.saved_2', { id: payload?.id, title: collectionLabel }), {
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
			// localPatch already logged and toasted this failure; a second report put
			// two rows and two toasts on one failed save.
			return undefined;
		},
		[handleSuccess, localPatch]
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
					// Reported above; a caller's catch must not report it again.
					markErrorReported(error);
					throw error;
				}
			}
		},
		[collectionName, handleError, handleSuccess, runtime]
	);

	return { patch, create };
};
