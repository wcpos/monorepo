import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import type { RxStorage, RxStorageInstance, RxStorageInstanceCreationParams } from 'rxdb';

const storageLogger = getLogger(['wcpos', 'db', 'storage']);
type StorageRpcMethod =
	| 'bulkWrite'
	| 'findDocumentsById'
	| 'query'
	| 'count'
	| 'getAttachmentData'
	| 'getChangedDocumentsSince'
	| 'cleanup'
	| 'remove'
	| 'close';
type InFlightCall = {
	methodName: StorageRpcMethod;
	kill: () => void;
};
type InstanceLatchState = {
	databaseName: string;
	failureReason: string | null;
	inFlight: Set<InFlightCall>;
};
const instancesByDatabaseName = new Map<string, Set<InstanceLatchState>>();

const TARGETED_RECOVERY =
	/targeted recovery failed for (.+): (missing-primary-row|missing-index-row|no-valid-document|index-mismatch|recovered-document-too-large)/;
function getTargetedRecovery(message: string): RegExpMatchArray | null {
	if (!message.startsWith('could not requestRemote: {')) return null;
	try {
		const workerMessage = JSON.parse(message.slice('could not requestRemote: '.length))?.error
			?.message;
		return typeof workerMessage === 'string' ? workerMessage.match(TARGETED_RECOVERY) : null;
	} catch {
		return null;
	}
}
/**
 * Classify an error from the RxDB storage layer and log it appropriately.
 * Returns true if the error was handled (callers may provide a fallback value).
 */
function handleStorageError(
	methodName: string,
	error: unknown,
	context: Record<string, unknown> = {}
): boolean {
	const message = error instanceof Error ? error.message : String(error);
	const targetedRecovery = getTargetedRecovery(message);
	const candidate = targetedRecovery ? '' : message;

	// CONFLICT errors (409) -- typically harmless, retried on next sync cycle
	if (candidate.includes('CONFLICT') || candidate.includes('409')) {
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
	if (
		candidate.includes('COL22') ||
		candidate.includes('schema validation') ||
		candidate.includes('schema mismatch')
	) {
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
	if (candidate.includes('No key or key range specified') || candidate.includes('No valid key')) {
		storageLogger.warn(`Invalid key in ${methodName}`, {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.STORAGE_ERROR,
				method: methodName,
			},
		});
		return true;
	}

	// JSON parse errors -- corrupted data in SQLite.
	// Name check (not instanceof) because errors originating in Web Workers or
	// other realms have a different SyntaxError constructor and would miss.
	if (
		error != null &&
		typeof error === 'object' &&
		(error as { name?: string }).name === 'SyntaxError' &&
		message.includes('is not valid JSON')
	) {
		storageLogger.error(`Corrupted JSON in storage for ${methodName}: ${message}`, {
			showToast: true,
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
		// requestRemote throws this only when the worker answers with an error envelope, so it is
		// still alive. A dead worker stays silent; the host disposal deadline marks that storage dead.
		storageLogger.error(`Storage worker error in ${methodName}`, {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.WORKER_CONNECTION_LOST,
				method: methodName,
				...context,
				recoveryDocumentId: targetedRecovery?.[1],
				recoveryFailure: targetedRecovery?.[2],
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

function terminalFailureError(databaseName: string, reason: string): Error {
	const error = new Error(`Storage terminally failed for database "${databaseName}": ${reason}`);
	error.name = 'StorageTerminallyFailedError';
	return error;
}

async function raceStorageCall<T>(
	state: InstanceLatchState,
	methodName: StorageRpcMethod,
	call: () => Promise<T>
): Promise<T> {
	if (state.failureReason !== null) {
		if (methodName === 'close') return undefined as T;
		throw terminalFailureError(state.databaseName, state.failureReason);
	}

	let callState: InFlightCall;
	const killed = new Promise<T>((resolve, reject) => {
		callState = {
			methodName,
			kill: () => {
				// RxDatabase releases USED_DATABASE_NAMES only from onClosed, which runs
				// only when close() completes. Once storage is declared dead, close must
				// resolve — never reject or hang — or the database name stays occupied
				// forever and a successor reopening the same scope hits rxdb error DB8.
				if (methodName === 'close') {
					resolve(undefined as T);
				} else {
					reject(terminalFailureError(state.databaseName, state.failureReason!));
				}
			},
		};
	});
	state.inFlight.add(callState!);
	let underlying: Promise<T>;
	try {
		underlying = call();
	} catch (error) {
		state.inFlight.delete(callState!);
		void killed.catch(() => undefined);
		throw error;
	}
	void underlying.catch(() => undefined);
	void underlying.then(
		() => state.inFlight.delete(callState),
		() => state.inFlight.delete(callState)
	);
	return Promise.race([underlying, killed]);
}

function unregisterInstance(state: InstanceLatchState): void {
	const instances = instancesByDatabaseName.get(state.databaseName);
	if (!instances) return;
	instances.delete(state);
	if (instances.size === 0) instancesByDatabaseName.delete(state.databaseName);
}

export function markStorageTerminallyFailed(databaseName: string, reason: string): boolean {
	const instances = instancesByDatabaseName.get(databaseName);
	if (!instances) return false;
	let marked = false;
	for (const state of instances) {
		if (state.failureReason !== null) continue;
		state.failureReason = reason;
		marked = true;
		for (const call of state.inFlight) {
			call.kill();
		}
	}
	if (marked) {
		storageLogger.error(`Storage terminally failed for database "${databaseName}": ${reason}`, {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.STORAGE_ERROR,
				databaseName,
				reason,
			},
		});
	}
	return marked;
}

/**
 * Wraps an RxStorageInstance to catch errors, log them through the logger,
 * and provide graceful fallbacks where safe to do so.
 */
function wrapStorageInstance<RxDocType>(
	instance: RxStorageInstance<RxDocType, any, any, any>,
	databaseName: string
): RxStorageInstance<RxDocType, any, any, any> {
	const originalFindDocumentsById = instance.findDocumentsById.bind(instance);
	const originalBulkWrite = instance.bulkWrite.bind(instance);

	// Handle composite primary keys (object with `key` property) vs simple string keys
	const pkField =
		typeof instance.schema.primaryKey === 'string'
			? instance.schema.primaryKey
			: instance.schema.primaryKey.key;

	instance.findDocumentsById = async (ids, withDeleted) => {
		try {
			return await originalFindDocumentsById(ids, withDeleted);
		} catch (error) {
			const handled = handleStorageError('findDocumentsById', error, {
				collectionName: instance.collectionName,
				documentId: ids.join(' '),
			});
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
						documentId: (write.document as any)[pkField],
						writeRow: write,
						documentInDb: (write.previous || write.document) as any,
					})),
				} as any;
			}
			throw error;
		}
	};

	const state: InstanceLatchState = {
		databaseName,
		failureReason: null,
		inFlight: new Set(),
	};
	const instances = instancesByDatabaseName.get(databaseName) ?? new Set();
	instances.add(state);
	instancesByDatabaseName.set(databaseName, instances);

	const bulkWrite = instance.bulkWrite.bind(instance);
	instance.bulkWrite = (...args) => raceStorageCall(state, 'bulkWrite', () => bulkWrite(...args));
	const findDocumentsById = instance.findDocumentsById.bind(instance);
	instance.findDocumentsById = (...args) =>
		raceStorageCall(state, 'findDocumentsById', () => findDocumentsById(...args));
	const query = instance.query.bind(instance);
	instance.query = (...args) => raceStorageCall(state, 'query', () => query(...args));
	const count = instance.count.bind(instance);
	instance.count = (...args) => raceStorageCall(state, 'count', () => count(...args));
	const getAttachmentData = instance.getAttachmentData.bind(instance);
	instance.getAttachmentData = (...args) =>
		raceStorageCall(state, 'getAttachmentData', () => getAttachmentData(...args));
	if (instance.getChangedDocumentsSince) {
		const getChangedDocumentsSince = instance.getChangedDocumentsSince.bind(instance);
		instance.getChangedDocumentsSince = (...args) =>
			raceStorageCall(state, 'getChangedDocumentsSince', () => getChangedDocumentsSince(...args));
	}
	const cleanup = instance.cleanup.bind(instance);
	instance.cleanup = (...args) => raceStorageCall(state, 'cleanup', () => cleanup(...args));
	const remove = instance.remove.bind(instance);
	instance.remove = (...args) => raceStorageCall(state, 'remove', () => remove(...args));
	const close = instance.close.bind(instance);
	instance.close = (...args) =>
		raceStorageCall(state, 'close', () => close(...args)).finally(() => unregisterInstance(state));

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
			return wrapStorageInstance(instance, params.databaseName);
		},
	};
}
