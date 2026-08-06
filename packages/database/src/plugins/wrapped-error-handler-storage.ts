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
	| 'close'
	| 'createStorageInstance';
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

// ---------------------------------------------------------------------------
// Dead-worker RPC watchdog (#163 follow-up)
// ---------------------------------------------------------------------------

/**
 * A worker that *errors* rejects the RPC and trips the latch above. A worker
 * that *dies* does neither: rxdb-premium's message channel collects Worker
 * `error` events into an array nobody reads, and rxdb's `requestRemote` has no
 * timeout, so every RPC stays pending forever. Measured live 45s after a bare
 * `worker.terminate()`: no banner, checkout and save still enabled, cashier
 * selling into a dead database.
 *
 * The deadline is the only signal that survives all three variants — terminated,
 * hung, and crashed — because it keys off the one thing that actually matters:
 * the answer never came back.
 *
 * 30s is deliberately far above any interactive storage call (reads and writes
 * on the POS hot path are milliseconds) while staying well inside a cashier's
 * patience during a real outage. It is not a latency SLO — a slow call is never
 * failed on elapsed time alone, see `storageCompletions`.
 */
export const STORAGE_RPC_WATCHDOG_MS = 30_000;

/**
 * How many consecutive deadlines must pass with the worker answering *nothing*
 * before it is declared dead. Two, so condemning takes a full minute of total
 * storage silence.
 *
 * Deliberately slower than it could be: a false positive latches the app into
 * degraded mode and blocks checkout and save until a reload, so certainty is
 * worth more here than a faster banner. A genuinely dead worker is not going to
 * recover in the extra 30s.
 */
const STORAGE_RPC_SILENT_WINDOWS_BEFORE_DEAD = 2;

/**
 * Only reads are ever condemned by the clock.
 *
 * A read that never returns is exactly the #163 symptom — barcode lookups went
 * silent — and failing one is harmless: it is idempotent, and the worst case of
 * a wrong guess is a spurious banner, never lost or duplicated data.
 *
 * Writes are deliberately excluded. The watchdog cannot cancel the underlying
 * RPC, so rejecting a `bulkWrite` on a hunch would tell the caller the write
 * failed while it may still commit in the worker — inviting a duplicate order on
 * retry. Writes still *feed* the liveness clock below when they succeed, so
 * excluding them costs no detection: a dead worker is caught by the next read,
 * and the POS reads constantly.
 *
 * `close`/`remove`/`cleanup` are absent for the same reason as always — they are
 * unbounded by design, `close`/`remove` are owned by the engine disposal
 * deadline (#875), and arming them would false-trip mid-Clear&Sync.
 */
const WATCHDOG_WATCHED_METHODS: ReadonlySet<StorageRpcMethod> = new Set<StorageRpcMethod>([
	'query',
	'count',
	'findDocumentsById',
	'getAttachmentData',
	'getChangedDocumentsSince',
]);

/**
 * How many RPCs the worker has *answered*, ever. One worker storage backs every
 * database (`adapters/default/index.web.ts`), so this counts liveness for the
 * worker as a whole, not for one instance.
 *
 * A monotonic counter rather than a timestamp on purpose: a clock corrected
 * backwards (NTP, manual change) would leave a stale "last success at" ahead of
 * every future window and re-arm the watchdog forever, leaving checkout enabled
 * against a dead worker. A counter cannot go backwards.
 *
 * An answer is an answer whether or not it was the answer we wanted, so ordinary
 * storage errors count too — a worker returning CONFLICT is emphatically alive.
 * Only worker-failure rejections are excluded, since counting those would let a
 * dying worker prove its own liveness.
 */
let storageCompletions = 0;

export function __resetStorageLivenessForTests(): void {
	storageCompletions = 0;
}

function noteStorageCompletion(error?: unknown): void {
	if (error !== undefined && isStorageWorkerFailure(error)) return;
	storageCompletions += 1;
}

function storageWorkerTimeoutError(methodName: StorageRpcMethod, waitedMs: number): Error {
	const error = new Error(
		`Storage worker did not answer ${methodName} within ${waitedMs}ms — the worker is gone`
	);
	error.name = 'StorageWorkerTimeoutError';
	return error;
}

function isStorageWorkerTimeout(error: unknown): boolean {
	return (
		error != null &&
		typeof error === 'object' &&
		(error as { name?: string }).name === 'StorageWorkerTimeoutError'
	);
}

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
	// A dead worker never produces a remote envelope to classify; the watchdog's
	// timeout is the only evidence there is, and it means the same thing.
	if (isStorageWorkerTimeout(error)) return true;
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
	latchDegradedStorage(state.databaseName, methodName, error);
}

function latchDegradedStorage(
	databaseName: string,
	methodName: StorageRpcMethod,
	error: unknown
): void {
	if (degradedByDatabaseName.has(databaseName)) return;

	const message = error instanceof Error ? error.message : String(error);
	degradedByDatabaseName.set(databaseName, {
		databaseName,
		methodName,
		message,
		at: Date.now(),
	});
	storageLogger.error(`Storage degraded for database "${databaseName}" in ${methodName}`, {
		saveToDb: true,
		context: {
			errorCode: ERROR_CODES.WORKER_CONNECTION_LOST,
			databaseName,
			method: methodName,
		},
	});
	publishDegradedStorage();
}

/**
 * Runs `call` under the dead-worker deadline, independent of any instance state.
 * Shared by the per-RPC watchdog and by database creation, which has no instance
 * to hang state off yet.
 *
 * Returns a promise that rejects with StorageWorkerTimeoutError once the worker
 * has answered nothing for STORAGE_RPC_SILENT_WINDOWS_BEFORE_DEAD consecutive
 * deadlines, and a disarm() that must be called when the guarded call settles.
 */
function createWatchdog(
	methodName: StorageRpcMethod,
	onDead: (error: Error) => void
): { expiry: Promise<never>; disarm: () => void } {
	const startedAt = Date.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expiry = new Promise<never>((_resolve, reject) => {
		let silentWindows = 0;
		const arm = () => {
			const armedAt = performance.now();
			const completionsAtArm = storageCompletions;
			timer = setTimeout(() => {
				// Elapsed time alone never condemns the worker. What separates "slow"
				// from "dead" is whether the worker answered ANYTHING during this
				// window — one storage worker backs every database, so any completion,
				// on any collection or scope, proves it is alive. Under heavy sync that
				// is constantly true, which is why a slow read queued behind a batch of
				// writes is never condemned. Counted per window rather than against the
				// call's start, or a single old answer would disarm this forever.
				if (storageCompletions > completionsAtArm) {
					silentWindows = 0;
					arm();
					return;
				}
				// The deadline is monotonic, so a slept device or a throttled
				// background tab can deliver this timer arbitrarily late with the worker
				// perfectly healthy — a till whose lid was closed overnight must not
				// wake to a spurious "reload the app". If far more time passed than we
				// asked for, the environment stalled, not the worker: re-arm and give it
				// a real deadline's worth of running time to answer in.
				if (performance.now() - armedAt > STORAGE_RPC_WATCHDOG_MS * 2) {
					arm();
					return;
				}
				silentWindows += 1;
				if (silentWindows < STORAGE_RPC_SILENT_WINDOWS_BEFORE_DEAD) {
					arm();
					return;
				}
				const error = storageWorkerTimeoutError(methodName, Date.now() - startedAt);
				onDead(error);
				reject(error);
			}, STORAGE_RPC_WATCHDOG_MS);
			// Never hold the process open for a watchdog (node/jest); browsers ignore this.
			(timer as unknown as { unref?: () => void }).unref?.();
		};
		arm();
	});
	void expiry.catch(() => undefined);
	return {
		expiry,
		disarm: () => {
			if (timer !== undefined) clearTimeout(timer);
		},
	};
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

	// Unknown errors -- log but don't suppress. Unclassified errors are the ones
	// with the least to go on, so the caller's context (which collection, which
	// database) is carried here rather than dropped.
	storageLogger.error(`Storage error in ${methodName}: ${message}`, {
		saveToDb: true,
		context: {
			errorCode: ERROR_CODES.STORAGE_ERROR,
			method: methodName,
			...context,
		},
	});
	return false;
}

// ---------------------------------------------------------------------------
// Cleanup containment
// ---------------------------------------------------------------------------

/**
 * Collections whose cleanup already reported a failure this session, keyed
 * `databaseName::collectionName`.
 */
const reportedCleanupFailures = new Set<string>();

/** Test-only reset for the report-once ledger. */
export function resetReportedCleanupFailures(): void {
	reportedCleanupFailures.clear();
}

/**
 * Drops a collection's report-once entry when its instance is torn down.
 *
 * Database and collection names are deterministic and deliberately reused — a
 * store switch reopens the same name (`closeDuplicates`), and Clear & Sync
 * removes then re-adds the same collection. Without this, a collection that
 * failed cleanup before a Clear & Sync would inherit "already reported"
 * afterwards, and Clear & Sync is precisely the remedy someone runs for it.
 */
function forgetCleanupFailure(key: string): void {
	reportedCleanupFailures.delete(key);
}

/**
 * Reports a failed `cleanup` and resolves it as done.
 *
 * RxDB's cleanup plugin starts from an un-awaited `createRxCollection` hook and
 * chains every collection of every database onto a single process-wide promise
 * (`RXSTORAGE_CLEANUP_QUEUE`). A rejection there is doubly damaging: it escapes
 * as an unhandled rejection — raising the dev LogBox overlay once per collection
 * — and it poisons the shared queue, so one failing collection silently ends
 * cleanup for the entire app. Tombstones then accumulate and, on the OPFS
 * backend, the documents file never compacts again.
 *
 * Resolving `true` reports the round complete, which is the only safe value:
 * `false` is the storage's "called me again" signal and RxDB loops on it
 * immediately (`while (!isDone && !closed)`). Note this ends the round rather
 * than retrying within it — `runCleanupAfterDelete` awaits the next write to
 * the collection before re-arming the `runEach` timer, so a collection that
 * goes quiet after a failure does not retry again this session.
 *
 * Reporting is once per collection until its cleanup completes: each report
 * writes a log document, and that insert is itself a write event that schedules
 * the next cleanup round, so an unthrottled report would feed itself. Only a
 * completed round (`true`) re-arms reporting — a `false` is mid-round progress,
 * and the realistic failing sequence is `false, false, …, throw`, so clearing
 * on `false` would report every round forever.
 *
 * A background cleanup that loses its race against a deliberate teardown —
 * engine disposal, a store-scope switch, Clear & Sync — is not a storage
 * failure, the same judgement `noteStorageWorkerFailure` already makes, so it
 * is contained silently.
 *
 * Composition with the dead-worker watchdog (#163 follow-up): this sits OUTSIDE
 * `raceStorageCall`, so it contains whatever that call rejects with — an
 * ordinary storage error today, and a `StorageWorkerTimeoutError` for free if
 * `cleanup` were ever added to `WATCHDOG_WATCHED_METHODS`. It is deliberately
 * absent from that set (unbounded by design, and arming it would false-trip
 * mid-Clear&Sync), so no cleanup timeout exists to contain right now. Nothing
 * here special-cases the timeout class, because nothing needs to: the watchdog
 * raises the degraded-storage latch from inside `raceStorageCall`, before this
 * runs, so containing the rejection never costs the banner.
 */
function containCleanupFailure(
	state: InstanceLatchState,
	key: string,
	collectionName: string,
	error: unknown
): boolean {
	const teardown = state.closing || state.failureReason !== null;
	if (!teardown && !reportedCleanupFailures.has(key)) {
		reportedCleanupFailures.add(key);
		handleStorageError('cleanup', error, {
			databaseName: state.databaseName,
			collectionName,
		});
	}
	return true;
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
		() => {
			noteStorageCompletion();
			state.inFlight.delete(callState);
		},
		(error) => {
			noteStorageCompletion(error);
			state.inFlight.delete(callState);
		}
	);

	if (!WATCHDOG_WATCHED_METHODS.has(methodName)) {
		return Promise.race([underlying, killed]);
	}

	const watchdog = createWatchdog(methodName, (error) =>
		noteStorageWorkerFailure(state, methodName, error)
	);
	return Promise.race([underlying, killed, watchdog.expiry]).finally(watchdog.disarm);
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
	const cleanupKey = `${databaseName}::${instance.collectionName}`;
	instance.cleanup = (...args) =>
		raceStorageCall(state, 'cleanup', () => cleanup(...args)).then(
			(result) => {
				// Only a completed round re-arms reporting — see containCleanupFailure.
				if (result === true) reportedCleanupFailures.delete(cleanupKey);
				return result;
			},
			(error) => containCleanupFailure(state, cleanupKey, instance.collectionName, error)
		);
	const remove = instance.remove.bind(instance);
	instance.remove = (...args) => {
		state.closing = true;
		// rxdb's remote storage closes the connection after `remove` just as it does
		// after `close`, and a collection reset removes then recreates the instance
		// (sync-engine's resetEngineCollection). Without unregistering here, every
		// Clear & Sync would strand a state in the map and pin the latch forever.
		return raceStorageCall(state, 'remove', () => remove(...args)).finally(() => {
			unregisterInstance(state);
			forgetCleanupFailure(cleanupKey);
		});
	};
	const close = instance.close.bind(instance);
	instance.close = (...args) => {
		state.closing = true;
		return raceStorageCall(state, 'close', () => close(...args)).finally(() => {
			unregisterInstance(state);
			forgetCleanupFailure(cleanupKey);
		});
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
			// Opening a store is a remote RPC too. A worker that died before startup
			// leaves it pending forever, so the app hangs on a spinner with no
			// instance in existence to arm a read against and nothing to show the
			// cashier. Failing instead surfaces as a bootstrap error the engine
			// already knows how to report.
			const watchdog = createWatchdog('createStorageInstance', (error) =>
				latchDegradedStorage(params.databaseName, 'createStorageInstance', error)
			);
			let instance: RxStorageInstance<RxDocType, Internals, InstanceCreationOptions, unknown>;
			try {
				instance = await Promise.race([storage.createStorageInstance(params), watchdog.expiry]);
			} finally {
				watchdog.disarm();
			}
			noteStorageCompletion();
			return wrapStorageInstance(instance, params.databaseName);
		},
	};
}
