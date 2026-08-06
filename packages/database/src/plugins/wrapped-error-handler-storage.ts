import { BehaviorSubject } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import type { Observable } from 'rxjs';
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
	/**
	 * Set the moment `close`/`remove` is invoked. Reads and writes already in
	 * flight when a store switch or Clear & Sync starts can reject as the worker
	 * tears its side down; that is teardown noise, not a live-store outage.
	 */
	closing: boolean;
};
const instancesByDatabaseName = new Map<string, Set<InstanceLatchState>>();

// ---------------------------------------------------------------------------
// Degraded storage signal (#163)
// ---------------------------------------------------------------------------

const REQUEST_REMOTE_ERROR_MARKER = 'could not requestRemote: ';
const WORKER_CONNECTION_FAILURE =
	/(?:worker|message (?:channel|port)).*(?:closed|disconnected|gone|lost|terminated|unavailable)|(?:closed|disconnected|gone|lost|terminated|unavailable).*(?:worker|message (?:channel|port))/i;

/**
 * RPCs whose failure must NOT raise the signal. `close`/`remove` run only while
 * an instance is being torn down on purpose — engine disposal, a store-scope
 * switch, Clear & Sync, and the OPFS logs-collection recovery all destroy
 * instances deliberately — so a worker error there is nothing a cashier can act
 * on, and raising a banner mid-teardown would be a false alarm.
 */
const NON_DEGRADING_METHODS: ReadonlySet<StorageRpcMethod> = new Set<StorageRpcMethod>([
	'close',
	'remove',
]);

export interface StorageDegradation {
	databaseName: string;
	/** The RPC that first lost the worker. */
	methodName: StorageRpcMethod;
	message: string;
	at: number;
}

const degradedByDatabaseName = new Map<string, StorageDegradation>();
const degradedStorageSubject = new BehaviorSubject<readonly StorageDegradation[]>([]);

/**
 * Databases whose storage worker stopped answering; empty while storage is healthy.
 *
 * Latch semantics: one-shot per database, and it can never be cleared by a later
 * successful call or instance teardown. Web databases share one module-scope
 * worker, so closing one database or resetting one collection does not replace the
 * worker that failed. Recovery requires replacing that worker by reloading the app.
 */
export const degradedStorage$: Observable<readonly StorageDegradation[]> =
	degradedStorageSubject.asObservable();

function publishDegradedStorage(): void {
	degradedStorageSubject.next([...degradedByDatabaseName.values()]);
}

/** True while the named database (or any database) has lost its storage worker. */
export function isStorageDegraded(databaseName?: string): boolean {
	return databaseName === undefined
		? degradedByDatabaseName.size > 0
		: degradedByDatabaseName.has(databaseName);
}

/**
 * Explicitly drops the latch. Recovery normally happens by reloading the app;
 * this escape hatch is used by tests to reset module state.
 */
export function clearStorageDegradation(databaseName?: string): void {
	if (databaseName === undefined) {
		if (degradedByDatabaseName.size === 0) return;
		degradedByDatabaseName.clear();
	} else if (!degradedByDatabaseName.delete(databaseName)) {
		return;
	}
	publishDegradedStorage();
}

function getRemoteErrorDescription(message: string): string | null {
	if (!message.startsWith(REQUEST_REMOTE_ERROR_MARKER)) return null;
	try {
		const envelope: unknown = JSON.parse(message.slice(REQUEST_REMOTE_ERROR_MARKER.length));
		if (envelope === null || typeof envelope !== 'object') return null;
		const remoteError = (envelope as { error?: unknown }).error;
		if (typeof remoteError === 'string') return remoteError;
		if (remoteError === null || typeof remoteError !== 'object') return null;
		const { name, message: remoteMessage } = remoteError as {
			name?: unknown;
			message?: unknown;
		};
		return [name, remoteMessage]
			.filter((value): value is string => typeof value === 'string')
			.join(': ');
	} catch {
		return null;
	}
}

/**
 * True for the storage-worker failure class from the #163 incident. Callers on
 * user-facing paths (barcode scanning) use this to fail loudly instead of
 * letting the rejection escape unhandled.
 */
export function isStorageWorkerFailure(error: unknown): boolean {
	if (error == null) return false;
	const message = error instanceof Error ? error.message : String(error);
	const remoteError = getRemoteErrorDescription(message);
	return remoteError !== null && WORKER_CONNECTION_FAILURE.test(remoteError);
}

function noteStorageWorkerFailure(
	state: InstanceLatchState,
	methodName: StorageRpcMethod,
	error: unknown
): void {
	if (NON_DEGRADING_METHODS.has(methodName)) return;
	// This instance is being torn down on purpose — see `closing`.
	if (state.closing) return;
	// Already declared terminally failed by the disposal deadline: the rejection
	// is ours, not the worker's, and disposal is not a live-store outage.
	if (state.failureReason !== null) return;
	if (!isStorageWorkerFailure(error)) return;
	if (degradedByDatabaseName.has(state.databaseName)) return;

	const message = error instanceof Error ? error.message : String(error);
	degradedByDatabaseName.set(state.databaseName, {
		databaseName: state.databaseName,
		methodName,
		message,
		at: Date.now(),
	});
	storageLogger.error(`Storage degraded for database "${state.databaseName}" in ${methodName}`, {
		saveToDb: true,
		context: {
			errorCode: ERROR_CODES.WORKER_CONNECTION_LOST,
			databaseName: state.databaseName,
			method: methodName,
		},
	});
	publishDegradedStorage();
}

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

	// Errors serialized by the remote worker can be either a worker/channel
	// failure or an ordinary storage-method exception.
	if (message.startsWith(REQUEST_REMOTE_ERROR_MARKER)) {
		const workerFailure = isStorageWorkerFailure(error);
		storageLogger.error(
			`${workerFailure ? 'Storage worker error' : 'Storage remote method error'} in ${methodName}`,
			{
				saveToDb: true,
				context: {
					errorCode: workerFailure ? ERROR_CODES.WORKER_CONNECTION_LOST : ERROR_CODES.STORAGE_ERROR,
					method: methodName,
					...context,
					recoveryDocumentId: targetedRecovery?.[1],
					recoveryFailure: targetedRecovery?.[2],
				},
			}
		);
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
		noteStorageWorkerFailure(state, methodName, error);
		throw error;
	}
	void underlying.catch((error) => noteStorageWorkerFailure(state, methodName, error));
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
	if (instances.size === 0) {
		instancesByDatabaseName.delete(state.databaseName);
	}
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
		closing: false,
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
	instance.remove = (...args) => {
		state.closing = true;
		// rxdb's remote storage closes the connection after `remove` just as it does
		// after `close`, and a collection reset removes then recreates the instance
		// (sync-engine's resetEngineCollection). Without unregistering here, every
		// Clear & Sync would strand a state in the map and pin the latch forever.
		return raceStorageCall(state, 'remove', () => remove(...args)).finally(() =>
			unregisterInstance(state)
		);
	};
	const close = instance.close.bind(instance);
	instance.close = (...args) => {
		state.closing = true;
		return raceStorageCall(state, 'close', () => close(...args)).finally(() =>
			unregisterInstance(state)
		);
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
			return wrapStorageInstance(instance, params.databaseName);
		},
	};
}
