import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

export function createStorageDegradedError() {
	return Object.assign(new Error('storage unavailable'), {
		name: 'StorageDegradedError',
		code: ERROR_CODES.WORKER_CONNECTION_LOST,
	});
}

export function isStorageDegradedError(error: unknown): boolean {
	return (
		error instanceof Error &&
		((error as Error & { code?: string }).code === ERROR_CODES.WORKER_CONNECTION_LOST ||
			error.message === 'storage unavailable')
	);
}
