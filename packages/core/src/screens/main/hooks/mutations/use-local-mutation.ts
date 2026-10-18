import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';
import {
	ActiveScopeChangedTwiceError,
	applyLocalPatch,
	documentRecordId,
	type LocalPatchProps,
	type MutationDocument,
	ResidentWriteError,
} from '@wcpos/query/mutations';
import { getCurrentBoundRegisterId } from '@wcpos/query/register-session';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES, type ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';

export {
	documentRecordId,
	findEngineResident,
	insertEngineResident,
	patchEngineResident,
	patchAndEnqueueEngineResident,
	syncableChanges,
	writeableCollection,
	type MutationDocument,
	type PayloadChanges,
} from '@wcpos/query/mutations';
const mutationLogger = getLogger(['wcpos', 'mutations', 'local']);
export const useLocalMutation = () => {
	const t = useT();
	const manager = useQueryRuntime();
	const localPatch = React.useCallback(
		async <TDocument extends MutationDocument, TData extends object>(
			input: LocalPatchProps<TDocument, TData>
		) => {
			const { document } = input;
			try {
				return await applyLocalPatch(manager, input, {
					registerId: getCurrentBoundRegisterId() ?? undefined,
				});
			} catch (failure) {
				const error = failure instanceof ResidentWriteError ? failure.cause : failure;
				if ((error as { code?: string })?.code === 'write-superseded-by-delete') throw error;
				const err = error as Record<string, unknown>;
				let message = getErrorMessage(error);
				let errorCode: ErrorCode = ERROR_CODES.LOCAL_DB_WRITE_FAILED;
				if (err.rxdb) {
					message = 'rxdb ' + String(err.code);
					errorCode = ERROR_CODES.LOCAL_DB_WRITE_FAILED;
				}
				mutationLogger.error('Local mutation failed', {
					code: errorCode,
					showToast: true,
					toast: { title: t('common.there_was_an_error', { message }) },
					context: {
						documentId:
							failure instanceof ResidentWriteError
								? failure.documentId
								: documentRecordId(document),
						collectionName:
							failure instanceof ResidentWriteError ? failure.collectionName : undefined,
						error: message,
					},
				});
				if (error instanceof ActiveScopeChangedTwiceError) {
					throw error;
				}
			}
		},
		[manager, t]
	);
	return { localPatch };
};
