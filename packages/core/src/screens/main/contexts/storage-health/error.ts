import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

export function createStorageDegradedError() {
	return Object.assign(new Error('storage unavailable'), {
		name: 'StorageDegradedError',
		code: ERROR_CODES.WORKER_CONNECTION_LOST,
	});
}

export function isStorageDegradedError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	const code = (error as Error & { code?: string }).code;
	return (
		code === ERROR_CODES.WORKER_CONNECTION_LOST ||
		error.name === 'StorageDegradedError' ||
		error.message === 'storage unavailable' ||
		error.message.includes('could not requestRemote')
	);
}
