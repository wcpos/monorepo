import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { createStorageDegradedError } from '../../contexts/storage-health/error';

const storageGuardLogger = getLogger(['wcpos', 'pos', 'storage-health']);

export function throwIfStorageDegraded({
	isDegraded,
	message,
	context,
}: {
	isDegraded: boolean;
	message: string;
	context?: Record<string, unknown>;
}) {
	if (!isDegraded) {
		return;
	}

	storageGuardLogger.error(message, {
		showToast: true,
		saveToDb: true,
		context: {
			errorCode: ERROR_CODES.WORKER_CONNECTION_LOST,
			...context,
		},
	});

	throw createStorageDegradedError();
}
