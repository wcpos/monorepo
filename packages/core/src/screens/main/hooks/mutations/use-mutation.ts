import * as React from 'react';

import {
	createEngineResident,
	CreateScopeChangedTwiceError,
	ResidentWriteError,
} from '@wcpos/query/mutations';
import { useQueryRuntime, type WriteableCollection, WriteOutcomeError } from '@wcpos/query';
import { getLogger, markErrorReported } from '@wcpos/utils/logger';

import { useLocalMutation, type WriteTarget } from './use-local-mutation';
import { useT } from '../../../../contexts/translations';
import { reportPushFailure } from '../../contexts/push-failure-code';

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
		async ({ document, data }: { document: WriteTarget; data: Record<string, unknown> }) => {
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
					// Reported above; a caller's catch must not report it again.
					markErrorReported(error);
					throw error;
				}
			}
		},
		[collectionName, handleError, handleSuccess, runtime]
	);

	// Command modules call it `patchRecord` because the seam scan fences the member name `patch`;
	// a command module is the one place that may hold the resident write (ADR 0033 item 6).
	return { create, patchRecord: patch };
};
