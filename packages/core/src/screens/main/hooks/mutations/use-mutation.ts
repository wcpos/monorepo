import * as React from 'react';

import {
	createEngineResident,
	CreateScopeChangedTwiceError,
	ResidentWriteError,
} from '@wcpos/query/mutations';
import { useQueryRuntime, type WriteableCollection, WriteOutcomeError } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { documentRecordId, type MutationDocument, useLocalMutation } from './use-local-mutation';
import { useT } from '../../../../contexts/translations';
import { pushFailureCode } from '../../contexts/push-failure-code';

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
			try {
				const currentResident = await createEngineResident(runtime, {
					collection: collectionName,
					data,
					awaitRemoteId,
				});
				if (currentResident instanceof ResidentWriteError) {
					handleError(currentResident.cause);
					return;
				}

				handleSuccess(currentResident as unknown as Record<string, unknown>);
				return currentResident;
			} catch (error) {
				handleError(error);
				if (awaitRemoteId || error instanceof CreateScopeChangedTwiceError) {
					throw error;
				}
			}
		},
		[collectionName, handleError, handleSuccess, runtime]
	);

	// `patchRecord` is the same function under the name a screen's /commands/ module calls it by:
	// the seam fences the member name `patch` wherever core spells it, and a command module is
	// the one place that may hold the resident write (ADR 0033 item 6).
	return { patch, create, patchRecord: patch };
};
