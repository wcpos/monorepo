import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import type { RxStorage, RxStorageInstance, RxStorageInstanceCreationParams } from 'rxdb';

const storageLogger = getLogger(['wcpos', 'db', 'storage']);

/**
 * Classify an error from the RxDB storage layer and log it appropriately.
 * Returns true if the error was handled (callers may provide a fallback value).
 */
function handleStorageError(methodName: string, error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);

	// CONFLICT errors (409) -- typically harmless, retried on next sync cycle
	if (message.includes('CONFLICT') || message.includes('409')) {
		storageLogger.warn(`Write conflict in ${methodName}`, {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.WRITE_CONFLICT,
				method: methodName,
			},
		});
		return true;
	}

	// Schema validation errors (COL22)
	if (message.includes('COL22') || message.includes('schema')) {
		storageLogger.warn(`Schema validation failed in ${methodName}`, {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.SCHEMA_VALIDATION_FAILED,
				method: methodName,
			},
		});
		return true;
	}

	// IndexedDB key errors (null ID)
	if (message.includes('No key or key range specified') || message.includes('No valid key')) {
		storageLogger.warn(`Invalid key in ${methodName}`, {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.STORAGE_ERROR,
				method: methodName,
			},
		});
		return true;
	}

	// Worker communication failures
	if (message.includes('could not requestRemote')) {
		storageLogger.error(`Storage worker error in ${methodName}`, {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.WORKER_CONNECTION_LOST,
				method: methodName,
			},
		});
		// Don't suppress -- this is critical
		return false;
	}

	// Unknown errors -- log but don't suppress
	storageLogger.error(`Storage error in ${methodName}: ${message}`, {
		saveToDb: true,
		context: {
			errorCode: ERROR_CODES.STORAGE_ERROR,
			method: methodName,
		},
	});
	return false;
}

/**
 * Wraps an RxStorageInstance to catch errors, log them through the logger,
 * and provide graceful fallbacks where safe to do so.
 */
function wrapStorageInstance<RxDocType>(
	instance: RxStorageInstance<RxDocType, any, any, any>
): RxStorageInstance<RxDocType, any, any, any> {
	const originalFindDocumentsById = instance.findDocumentsById.bind(instance);
	const originalBulkWrite = instance.bulkWrite.bind(instance);

	instance.findDocumentsById = async (ids, withDeleted) => {
		try {
			return await originalFindDocumentsById(ids, withDeleted);
		} catch (error) {
			const handled = handleStorageError('findDocumentsById', error);
			if (handled) {
				// Return empty results as graceful fallback
				return [] as any;
			}
			throw error;
		}
	};

	instance.bulkWrite = async (documentWrites, context) => {
		try {
			return await originalBulkWrite(documentWrites, context);
		} catch (error) {
			const handled = handleStorageError('bulkWrite', error);
			if (handled) {
				// Return all writes as errors so the caller can handle partial results.
				// RxStorageBulkWriteResponse only has an `error` array in RxDB 16.x.
				return {
					error: documentWrites.map((write) => ({
						status: 409 as const,
						isError: true as const,
						documentId: (write.document as any)[instance.schema.primaryKey],
						writeRow: write,
						documentInDb: (write.previous || write.document) as any,
					})),
				} as any;
			}
			throw error;
		}
	};

	return instance;
}

/**
 * Wraps an RxStorage to add error handling to all storage instances it creates.
 */
export function wrappedErrorHandlerStorage<Internals, InstanceCreationOptions>({
	storage,
}: {
	storage: RxStorage<Internals, InstanceCreationOptions>;
}): RxStorage<Internals, InstanceCreationOptions> {
	return {
		name: 'error-handler-' + storage.name,
		rxdbVersion: storage.rxdbVersion,
		async createStorageInstance<RxDocType>(
			params: RxStorageInstanceCreationParams<RxDocType, InstanceCreationOptions>
		) {
			const instance = await storage.createStorageInstance(params);
			return wrapStorageInstance(instance);
		},
	};
}
