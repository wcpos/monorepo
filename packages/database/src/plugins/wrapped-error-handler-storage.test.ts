// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

import { getLogger } from '@wcpos/utils/logger';

import {
	__resetStorageLivenessForTests,
	clearStorageDegradation,
	degradedStorage$,
	isStorageDegraded,
	isStorageWorkerFailure,
	resetReportedCleanupFailures,
	STORAGE_RPC_WATCHDOG_MS,
	wrappedErrorHandlerStorage,
} from './wrapped-error-handler-storage';

import type { StorageDegradation } from './wrapped-error-handler-storage';
import type { RxStorage, RxStorageInstance } from 'rxdb';

const terminalFailureApi = jest.requireActual<typeof import('./wrapped-error-handler-storage')>(
	'./wrapped-error-handler-storage'
) as typeof import('./wrapped-error-handler-storage') & {
	markStorageTerminallyFailed?: (databaseName: string, reason: string) => boolean;
};

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		warn: jest.fn(),
		error: jest.fn(),
	})),
}));

jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: {
		WRITE_CONFLICT: 'DB02007',
		SCHEMA_VALIDATION_FAILED: 'DB03005',
		STORAGE_ERROR: 'DB01004',
		WORKER_CONNECTION_LOST: 'DB01005',
	},
}));

/**
 * The module under test calls getLogger() at load time (line 6 of the source),
 * which runs during the import above. The mock is already in place by then
 * (jest.mock is hoisted), so we can grab the instance it returned.
 */
const mockLoggerInstance = (getLogger as jest.Mock).mock.results[0].value as {
	warn: jest.Mock;
	error: jest.Mock;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStorageInstance(overrides: Partial<RxStorageInstance<any, any, any, any>> = {}) {
	return {
		schema: { version: 0, type: 'object', properties: {}, primaryKey: 'id' },
		findDocumentsById: jest.fn(),
		bulkWrite: jest.fn(),
		query: jest.fn(),
		count: jest.fn(),
		getAttachmentData: jest.fn(),
		getChangedDocumentsSince: jest.fn(),
		changeStream: jest.fn(),
		cleanup: jest.fn(),
		close: jest.fn(),
		remove: jest.fn(),
		collectionName: 'test-collection',
		databaseName: 'test-db',
		internals: {},
		options: {},
		...overrides,
	} as unknown as RxStorageInstance<any, any, any, any>;
}

function createMockStorage(instance: RxStorageInstance<any, any, any, any>) {
	return {
		name: 'mock-storage',
		rxdbVersion: '16.0.0',
		createStorageInstance: jest.fn().mockResolvedValue(instance),
	} as unknown as RxStorage<any, any>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wrappedErrorHandlerStorage', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// -----------------------------------------------------------------------
	// Wrapper creation
	// -----------------------------------------------------------------------

	describe('wrapper creation', () => {
		it('should prepend "error-handler-" to the storage name', () => {
			const instance = createMockStorageInstance();
			const storage = createMockStorage(instance);

			const wrapped = wrappedErrorHandlerStorage({ storage });

			expect(wrapped.name).toBe('error-handler-mock-storage');
		});

		it('should preserve the rxdbVersion from the inner storage', () => {
			const instance = createMockStorageInstance();
			const storage = createMockStorage(instance);

			const wrapped = wrappedErrorHandlerStorage({ storage });

			expect(wrapped.rxdbVersion).toBe('16.0.0');
		});

		it('should delegate createStorageInstance to the inner storage', async () => {
			const instance = createMockStorageInstance();
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });

			const params = { databaseName: 'db', collectionName: 'col', schema: {}, options: {} };
			await wrapped.createStorageInstance(params as any);

			expect(storage.createStorageInstance).toHaveBeenCalledWith(params);
		});
	});

	// -----------------------------------------------------------------------
	// findDocumentsById
	// -----------------------------------------------------------------------

	describe('findDocumentsById', () => {
		it('should pass through results when the underlying call succeeds', async () => {
			const expected = [{ id: '1', name: 'Alice' }];
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockResolvedValue(expected),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			const result = await wrappedInstance.findDocumentsById(['1'], false);

			expect(result).toEqual(expected);
		});

		it.each([
			['CONFLICT error', new Error('CONFLICT on document xyz')],
			['409 error', new Error('HTTP 409 response')],
			['COL22 error', new Error('COL22: schema validation')],
			['schema validation error', new Error('schema validation failed for field')],
			['schema mismatch error', new Error('schema mismatch detected')],
			['key range error', new Error('No key or key range specified')],
			['invalid key error', new Error('No valid key provided')],
		])('should return an empty array for handled error: %s', async (_label, error) => {
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue(error),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			const result = await wrappedInstance.findDocumentsById(['1'], false);

			expect(result).toEqual([]);
		});

		it('should log a warning for handled errors', async () => {
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue(new Error('CONFLICT')),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			await wrappedInstance.findDocumentsById(['1'], false);

			expect(mockLoggerInstance.warn).toHaveBeenCalled();
		});

		it('should re-throw for requestRemote errors', async () => {
			const recoveryDocumentId = 'customers:search=Acme "West"\\priority: high';
			const error = new Error(
				'could not requestRemote: ' +
					JSON.stringify({
						error: {
							message: `Unexpected token; targeted recovery failed for ${recoveryDocumentId}: no-valid-document`,
						},
					})
			);
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue(error),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			await expect(wrappedInstance.findDocumentsById(['1'], false)).rejects.toThrow(
				'could not requestRemote'
			);
			expect(mockLoggerInstance.error).toHaveBeenCalledWith(
				'Storage remote method error in findDocumentsById',
				expect.objectContaining({
					context: expect.objectContaining({
						errorCode: 'DB01004',
						collectionName: 'test-collection',
						documentId: '1',
						recoveryDocumentId,
						recoveryFailure: 'no-valid-document',
					}),
				})
			);
		});

		it('should preserve a requestRemote error with a malformed envelope', async () => {
			const error = new Error('could not requestRemote: {"error":');
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue(error),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({} as any);

			await expect(wrappedInstance.findDocumentsById(['1'], false)).rejects.toBe(error);
			expect(mockLoggerInstance.error).toHaveBeenCalledWith(
				'Storage remote method error in findDocumentsById',
				expect.objectContaining({
					context: expect.objectContaining({ errorCode: 'DB01004' }),
				})
			);
		});

		it('should not classify a recovery document ID containing 409 as a conflict', async () => {
			const error = new Error(
				'could not requestRemote: ' +
					JSON.stringify({
						params: [['409'], false],
						error: {
							message: 'Unexpected token; targeted recovery failed for 409: no-valid-document',
						},
					})
			);
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue(error),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({} as any);

			await expect(wrappedInstance.findDocumentsById(['409'], false)).rejects.toBe(error);
			expect(mockLoggerInstance.warn).not.toHaveBeenCalled();
			expect(mockLoggerInstance.error).toHaveBeenCalledWith(
				'Storage remote method error in findDocumentsById',
				expect.objectContaining({
					context: expect.objectContaining({
						errorCode: 'DB01004',
						recoveryDocumentId: '409',
						recoveryFailure: 'no-valid-document',
					}),
				})
			);
		});

		it('should re-throw for unknown errors', async () => {
			const error = new Error('something completely unexpected');
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue(error),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			await expect(wrappedInstance.findDocumentsById(['1'], false)).rejects.toThrow(
				'something completely unexpected'
			);
		});

		it('should log an error for unhandled errors', async () => {
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue(new Error('could not requestRemote')),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			await expect(wrappedInstance.findDocumentsById(['1'], false)).rejects.toThrow();

			expect(mockLoggerInstance.error).toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// bulkWrite
	// -----------------------------------------------------------------------

	describe('bulkWrite', () => {
		const sampleWrites = [
			{ document: { id: 'doc1', value: 'a' }, previous: undefined },
			{ document: { id: 'doc2', value: 'b' }, previous: { id: 'doc2', value: 'old' } },
		];

		it('should pass through results when the underlying call succeeds', async () => {
			const expected = { error: [] };
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockResolvedValue(expected),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			const result = await wrappedInstance.bulkWrite(sampleWrites as any, 'test-context');

			expect(result).toEqual(expected);
		});

		it.each([
			['CONFLICT error', new Error('CONFLICT on document')],
			['409 error', new Error('409 write rejected')],
			['COL22 error', new Error('COL22 validation failure')],
			['schema validation error', new Error('schema validation error on write')],
			['schema mismatch error', new Error('schema mismatch on field')],
			['key range error', new Error('No key or key range specified')],
			['invalid key error', new Error('No valid key for write')],
		])('should return error response for handled error: %s', async (_label, error) => {
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(error),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			const result = await wrappedInstance.bulkWrite(sampleWrites as any, 'test-context');

			expect(result.error).toHaveLength(2);
			expect(result.error[0]).toMatchObject({
				status: 409,
				isError: true,
				documentId: 'doc1',
				writeRow: sampleWrites[0],
			});
			expect(result.error[1]).toMatchObject({
				status: 409,
				isError: true,
				documentId: 'doc2',
				writeRow: sampleWrites[1],
			});
		});

		it('should use the document as documentInDb when previous is absent', async () => {
			const writes = [{ document: { id: 'new-doc', value: 'x' }, previous: undefined }];
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(new Error('CONFLICT')),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			const result = await wrappedInstance.bulkWrite(writes as any, 'ctx');

			expect((result.error[0] as any).documentInDb).toEqual(writes[0].document);
		});

		it('should use previous as documentInDb when previous exists', async () => {
			const prev = { id: 'doc', value: 'old' };
			const writes = [{ document: { id: 'doc', value: 'new' }, previous: prev }];
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(new Error('CONFLICT')),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			const result = await wrappedInstance.bulkWrite(writes as any, 'ctx');

			expect((result.error[0] as any).documentInDb).toEqual(prev);
		});

		it('should handle composite primary keys in error response', async () => {
			const compositeInstance = createMockStorageInstance({
				schema: {
					version: 0,
					type: 'object',
					properties: {},
					primaryKey: { key: 'syncId', fields: ['endpoint', 'id'], separator: '|' },
				},
				bulkWrite: jest.fn().mockRejectedValue(new Error('CONFLICT')),
			});
			const storage = createMockStorage(compositeInstance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			const writes = [
				{ document: { syncId: 'orders|42', endpoint: 'orders', id: 42 }, previous: undefined },
			];
			const result = await wrappedInstance.bulkWrite(writes as any, 'ctx');

			expect(result.error[0].documentId).toBe('orders|42');
		});

		it('should re-throw for requestRemote errors', async () => {
			const error = new Error('could not requestRemote');
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(error),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			await expect(wrappedInstance.bulkWrite(sampleWrites as any, 'test-context')).rejects.toThrow(
				'could not requestRemote'
			);
		});

		it('should re-throw for unknown errors', async () => {
			const error = new Error('disk on fire');
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(error),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			await expect(wrappedInstance.bulkWrite(sampleWrites as any, 'test-context')).rejects.toThrow(
				'disk on fire'
			);
		});

		it('should log an error for unhandled errors', async () => {
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(new Error('could not requestRemote')),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			await expect(wrappedInstance.bulkWrite(sampleWrites as any, 'ctx')).rejects.toThrow();

			expect(mockLoggerInstance.error).toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// handleStorageError classification (via observable behaviour)
	// -----------------------------------------------------------------------

	describe('error classification logging', () => {
		it('should log with WRITE_CONFLICT code for CONFLICT errors', async () => {
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue(new Error('CONFLICT')),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			await wrappedInstance.findDocumentsById(['1'], false);

			expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
				expect.stringContaining('Write conflict'),
				expect.objectContaining({
					context: expect.objectContaining({ errorCode: 'DB02007' }),
				})
			);
		});

		it('should log with SCHEMA_VALIDATION_FAILED code for COL22 errors', async () => {
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue(new Error('COL22 invalid')),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			await wrappedInstance.findDocumentsById(['1'], false);

			expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
				expect.stringContaining('Schema validation'),
				expect.objectContaining({
					context: expect.objectContaining({ errorCode: 'DB03005' }),
				})
			);
		});

		it('should log with STORAGE_ERROR code for key errors', async () => {
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue(new Error('No key or key range specified')),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			await wrappedInstance.findDocumentsById(['1'], false);

			expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
				expect.stringContaining('Invalid key'),
				expect.objectContaining({
					context: expect.objectContaining({ errorCode: 'DB01004' }),
				})
			);
		});

		it('should log with WORKER_CONNECTION_LOST code for requestRemote errors', async () => {
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue(
					new Error(
						'could not requestRemote: ' +
							JSON.stringify({
								error: { message: 'storage worker connection lost' },
							})
					)
				),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			await expect(wrappedInstance.findDocumentsById(['1'], false)).rejects.toThrow();

			expect(mockLoggerInstance.error).toHaveBeenCalledWith(
				expect.stringContaining('Storage worker error'),
				expect.objectContaining({
					context: expect.objectContaining({ errorCode: 'DB01005' }),
				})
			);
		});

		it('should handle non-Error throwables by converting to string', async () => {
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue('plain string error'),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			// A plain string won't match any handled pattern, so it re-throws
			await expect(wrappedInstance.findDocumentsById(['1'], false)).rejects.toBe(
				'plain string error'
			);

			expect(mockLoggerInstance.error).toHaveBeenCalledWith(
				expect.stringContaining('plain string error'),
				expect.any(Object)
			);
		});
	});

	describe('terminal failure latch', () => {
		function markTerminalFailure(databaseName: string, reason = 'worker stopped responding') {
			expect(terminalFailureApi.markStorageTerminallyFailed).toEqual(expect.any(Function));
			return terminalFailureApi.markStorageTerminallyFailed!(databaseName, reason);
		}

		it('rejects all in-flight writes so a guarded-write drain settles', async () => {
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn(() => new Promise(() => undefined)),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'hung-writes' } as any);
			const writes = Array.from({ length: 3 }, (_, index) =>
				wrappedInstance.bulkWrite(
					[{ document: { id: `doc-${index}` }, previous: undefined }] as any,
					'test'
				)
			);

			expect(markTerminalFailure('hung-writes')).toBe(true);

			await expect(writes[0]).rejects.toMatchObject({
				name: 'StorageTerminallyFailedError',
				message: expect.stringContaining('worker stopped responding'),
			});
			await expect(Promise.allSettled(writes)).resolves.toHaveLength(3);
		});

		it('resolves an in-flight close when marked', async () => {
			const instance = createMockStorageInstance({
				close: jest.fn(() => new Promise(() => undefined)),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'hung-close' } as any);
			const close = wrappedInstance.close();

			expect(markTerminalFailure('hung-close')).toBe(true);
			await expect(close).resolves.toBeUndefined();
		});

		it('fails post-mark RPCs fast except for close', async () => {
			const bulkWrite = jest.fn(() => new Promise(() => undefined));
			const findDocumentsById = jest.fn(() => new Promise(() => undefined));
			const query = jest.fn(() => new Promise(() => undefined));
			const close = jest.fn(() => new Promise(() => undefined));
			const instance = createMockStorageInstance({
				bulkWrite,
				findDocumentsById,
				query,
				close,
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'post-mark' } as any);

			expect(markTerminalFailure('post-mark')).toBe(true);

			await expect(wrappedInstance.bulkWrite([] as any, 'test')).rejects.toHaveProperty(
				'name',
				'StorageTerminallyFailedError'
			);
			await expect(wrappedInstance.findDocumentsById([], false)).rejects.toHaveProperty(
				'name',
				'StorageTerminallyFailedError'
			);
			await expect(wrappedInstance.query({} as any)).rejects.toHaveProperty(
				'name',
				'StorageTerminallyFailedError'
			);
			await expect(wrappedInstance.close()).resolves.toBeUndefined();
			expect(bulkWrite).not.toHaveBeenCalled();
			expect(findDocumentsById).not.toHaveBeenCalled();
			expect(query).not.toHaveBeenCalled();
			expect(close).not.toHaveBeenCalled();
		});

		it('does not affect an instance created for the same database after the mark', async () => {
			const first = createMockStorageInstance({
				query: jest.fn().mockResolvedValue({ documents: [] }),
			});
			await wrappedErrorHandlerStorage({
				storage: createMockStorage(first),
			}).createStorageInstance({ databaseName: 'reopened-db' } as any);
			expect(markTerminalFailure('reopened-db')).toBe(true);

			const expected = { documents: [{ id: 'successor' }] };
			const successor = createMockStorageInstance({
				query: jest.fn().mockResolvedValue(expected),
			});
			const successorInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(successor),
			}).createStorageInstance({ databaseName: 'reopened-db' } as any);

			await expect(successorInstance.query({} as any)).resolves.toBe(expected);
		});

		it('returns false for an unknown database name', () => {
			expect(markTerminalFailure('unknown-database')).toBe(false);
		});
	});

	describe('degraded storage signal (#163)', () => {
		const workerLoss = () =>
			new Error(
				'could not requestRemote: {"methodName":"bulkWrite","error":{"message":"worker gone"}}'
			);

		function latest(): readonly StorageDegradation[] {
			let value: readonly StorageDegradation[] = [];
			degradedStorage$.subscribe((next) => (value = next)).unsubscribe();
			return value;
		}

		beforeEach(() => {
			clearStorageDegradation();
		});

		afterEach(() => {
			clearStorageDegradation();
		});

		it('latches when a bulkWrite loses the storage worker', async () => {
			const emissions: StorageDegradation[][] = [];
			const subscription = degradedStorage$.subscribe((next) => {
				emissions.push([...next]);
			});
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(workerLoss()),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'degraded-db' } as any);

			await expect(
				wrappedInstance.bulkWrite([{ document: { id: '1' } }] as any, 'test')
			).rejects.toThrow('could not requestRemote');

			expect(isStorageDegraded('degraded-db')).toBe(true);
			expect(isStorageDegraded()).toBe(true);
			expect(latest()).toEqual([
				expect.objectContaining({ databaseName: 'degraded-db', methodName: 'bulkWrite' }),
			]);
			expect(emissions[emissions.length - 1]).toHaveLength(1);
			subscription.unsubscribe();
		});

		it('latches on a read path that loses the worker (barcode lookups run through query)', async () => {
			const instance = createMockStorageInstance({
				query: jest.fn().mockRejectedValue(workerLoss()),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'degraded-read-db' } as any);

			await expect(wrappedInstance.query({} as any)).rejects.toThrow('could not requestRemote');

			expect(latest()).toEqual([
				expect.objectContaining({ databaseName: 'degraded-read-db', methodName: 'query' }),
			]);
		});

		it('stays quiet for handled write conflicts and ordinary errors', async () => {
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(new Error('CONFLICT')),
				query: jest.fn().mockRejectedValue(new Error('boom')),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'healthy-db' } as any);

			await wrappedInstance.bulkWrite([{ document: { id: '1' } }] as any, 'test');
			await expect(wrappedInstance.query({} as any)).rejects.toThrow('boom');

			expect(isStorageDegraded('healthy-db')).toBe(false);
			expect(latest()).toEqual([]);
		});

		it('stays quiet for storage-method errors serialized by requestRemote', async () => {
			const quotaError = new Error(
				'could not requestRemote: {"methodName":"bulkWrite","error":{"name":"QuotaExceededError","message":"The quota has been exceeded."}}'
			);
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(quotaError),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'quota-db' } as any);

			await expect(
				wrappedInstance.bulkWrite([{ document: { id: '1' } }] as any, 'test')
			).rejects.toThrow('could not requestRemote');

			expect(mockLoggerInstance.error).toHaveBeenCalledWith(
				'Storage remote method error in bulkWrite',
				expect.objectContaining({
					context: expect.objectContaining({ errorCode: 'DB01004' }),
				})
			);
			expect(isStorageWorkerFailure(quotaError)).toBe(false);
			expect(isStorageDegraded('quota-db')).toBe(false);
			expect(latest()).toEqual([]);
		});

		it('stays quiet when teardown RPCs fail (store switch / Clear & Sync / logs recovery)', async () => {
			const instance = createMockStorageInstance({
				close: jest.fn().mockRejectedValue(workerLoss()),
				remove: jest.fn().mockRejectedValue(workerLoss()),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'teardown-db' } as any);

			await expect(wrappedInstance.remove()).rejects.toThrow('could not requestRemote');
			await expect(wrappedInstance.close()).rejects.toThrow('could not requestRemote');

			expect(isStorageDegraded('teardown-db')).toBe(false);
		});

		it('stays quiet for reads still in flight when the scope starts closing', async () => {
			let rejectQuery: ((error: Error) => void) | undefined;
			const instance = createMockStorageInstance({
				query: jest.fn(() => new Promise((_resolve, reject) => (rejectQuery = reject))),
				close: jest.fn().mockResolvedValue(undefined),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'switching-db' } as any);

			// A replication read is mid-flight when the store switch begins.
			const inFlight = wrappedInstance.query({} as any);
			const closed = wrappedInstance.close();
			rejectQuery!(workerLoss());

			await expect(inFlight).rejects.toThrow('could not requestRemote');
			await closed;

			expect(isStorageDegraded('switching-db')).toBe(false);
		});

		it('stays quiet for rejections caused by the disposal deadline latch (#875)', async () => {
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn(() => new Promise(() => undefined)),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'disposing-db' } as any);
			const write = wrappedInstance.bulkWrite([{ document: { id: '1' } }] as any, 'test');

			expect(terminalFailureApi.markStorageTerminallyFailed!('disposing-db', 'disposal')).toBe(
				true
			);
			await expect(write).rejects.toHaveProperty('name', 'StorageTerminallyFailedError');

			expect(isStorageDegraded('disposing-db')).toBe(false);
		});

		it('latches once per database and keeps other databases healthy', async () => {
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(workerLoss()),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'noisy-db' } as any);

			const emissions: unknown[] = [];
			const subscription = degradedStorage$.subscribe((next) => emissions.push(next));
			await expect(
				wrappedInstance.bulkWrite([{ document: { id: '1' } }] as any, 'test')
			).rejects.toThrow();
			await expect(
				wrappedInstance.bulkWrite([{ document: { id: '2' } }] as any, 'test')
			).rejects.toThrow();

			// One replay + exactly one change emission: the latch never re-fires.
			expect(emissions).toHaveLength(2);
			expect(isStorageDegraded('other-db')).toBe(false);
			subscription.unsubscribe();
		});

		it('keeps the latch when a database scope closes but the shared worker remains', async () => {
			await wrappedErrorHandlerStorage({
				storage: createMockStorage(createMockStorageInstance()),
			}).createStorageInstance({ databaseName: 'surviving-db' } as any);
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(workerLoss()),
				close: jest.fn().mockResolvedValue(undefined),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'closing-db' } as any);

			await expect(
				wrappedInstance.bulkWrite([{ document: { id: '1' } }] as any, 'test')
			).rejects.toThrow();
			expect(isStorageDegraded('closing-db')).toBe(true);

			await wrappedInstance.close();

			expect(isStorageDegraded('closing-db')).toBe(true);
			expect(isStorageDegraded()).toBe(true);
			expect(latest()).toEqual([
				expect.objectContaining({
					databaseName: 'closing-db',
					methodName: 'bulkWrite',
				}),
			]);
		});

		it.each(['close', 'remove'] as const)('keeps the latch when %s rejects', async (methodName) => {
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(workerLoss()),
				[methodName]: jest.fn().mockRejectedValue(new Error(`${methodName} failed`)),
			});
			const databaseName = `failed-${methodName}-db`;
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName } as any);

			await expect(
				wrappedInstance.bulkWrite([{ document: { id: '1' } }] as any, 'test')
			).rejects.toThrow('could not requestRemote');
			await expect(wrappedInstance[methodName]()).rejects.toThrow(`${methodName} failed`);

			expect(isStorageDegraded(databaseName)).toBe(true);
		});

		it('does not infer worker loss from a malformed requestRemote wrapper', () => {
			expect(isStorageWorkerFailure('could not requestRemote: string form')).toBe(false);
		});

		it('recognises worker-loss errors for callers that must fail loudly', () => {
			expect(isStorageWorkerFailure(workerLoss())).toBe(true);
			expect(isStorageWorkerFailure(new Error('CONFLICT'))).toBe(false);
			expect(isStorageWorkerFailure(undefined)).toBe(false);
		});

		// OPFS JSON corruption arrives with the same requestRemote prefix but has its
		// own owner (packages/query logs-storage-recovery) and its own remedy.
		it('excludes the self-healing OPFS corruption class', async () => {
			const corruption = new Error(
				'could not requestRemote: {"methodName":"query","error":{"name":"SyntaxError","message":"Expected \':\' after property name in JSON at position 1263252"}}'
			);
			expect(isStorageWorkerFailure(corruption)).toBe(false);

			const instance = createMockStorageInstance({
				query: jest.fn().mockRejectedValue(corruption),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'corrupt-db' } as any);

			await expect(wrappedInstance.query({} as any)).rejects.toThrow('could not requestRemote');

			expect(isStorageDegraded('corrupt-db')).toBe(false);
		});

		it('keeps the latch when a collection reset removes the instance', async () => {
			const instance = createMockStorageInstance({
				bulkWrite: jest.fn().mockRejectedValue(workerLoss()),
				remove: jest.fn().mockResolvedValue(undefined),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'reset-db' } as any);

			await expect(
				wrappedInstance.bulkWrite([{ document: { id: '1' } }] as any, 'test')
			).rejects.toThrow();
			expect(isStorageDegraded('reset-db')).toBe(true);

			await wrappedInstance.remove();

			expect(isStorageDegraded('reset-db')).toBe(true);
		});
	});

	// ---------------------------------------------------------------------------
	// Dead-worker RPC watchdog (#163 follow-up)
	//
	// A hard-terminated worker never answers and never errors: rxdb-premium's
	// message channel collects Worker "error" events into an array nobody reads,
	// and rxdb's requestRemote has no timeout. Every RPC then stays pending
	// forever, so the degraded-storage latch never fires and the POS keeps selling
	// into a dead database. Measured live: 45s after a bare worker.terminate(),
	// banner=false, checkout still enabled.
	// ---------------------------------------------------------------------------
	describe('dead-worker RPC watchdog', () => {
		const pending = () => jest.fn(() => new Promise(() => undefined));

		beforeEach(() => {
			jest.useFakeTimers();
			__resetStorageLivenessForTests();
			clearStorageDegradation();
		});

		afterEach(() => {
			jest.restoreAllMocks();
			jest.useRealTimers();
			clearStorageDegradation();
		});

		async function wrap(databaseName: string, overrides = {}) {
			const instance = createMockStorageInstance(overrides);
			return wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName } as any);
		}

		it('trips the latch when an RPC never comes back', async () => {
			const wrappedInstance = await wrap('dead-worker-db', { query: pending() });

			const call = wrappedInstance.query({} as any);
			const assertion = expect(call).rejects.toMatchObject({
				name: 'StorageWorkerTimeoutError',
			});
			// One silent window is not enough — the worker gets a full minute.
			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS + 1);
			expect(isStorageDegraded('dead-worker-db')).toBe(false);

			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS + 1);
			await assertion;

			expect(isStorageDegraded('dead-worker-db')).toBe(true);
		});

		it('feeds the same failure class the latch and the POS already consume', async () => {
			const wrappedInstance = await wrap('dead-worker-class-db', { count: pending() });

			const caught = wrappedInstance.count({} as any).catch((error: unknown) => error);
			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS * 2 + 2);

			// The POS barcode path and the cart/checkout blocks all gate on this
			// predicate, so the watchdog has to answer to it too.
			expect(isStorageWorkerFailure(await caught)).toBe(true);
		});

		// The refutation that matters: a big OPFS write can legitimately take longer
		// than the deadline. If anything else on the same worker answered while the
		// slow call was outstanding, the worker is demonstrably alive.
		it('does not condemn a slow read while the worker keeps answering other traffic', async () => {
			let finishSlowRead: (() => void) | undefined;
			const wrappedInstance = await wrap('slow-alive-db', {
				query: jest.fn(
					() => new Promise((resolve) => (finishSlowRead = () => resolve({ documents: [] })))
				),
				count: jest.fn().mockResolvedValue(7),
			});

			const slowRead = wrappedInstance.query({} as any);
			// Heavy-but-alive: something completes inside every window, for minutes.
			for (let window = 0; window < 6; window += 1) {
				await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS * 0.5);
				await expect(wrappedInstance.count({} as any)).resolves.toBe(7);
				await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS * 0.5);
			}

			expect(isStorageDegraded('slow-alive-db')).toBe(false);

			finishSlowRead!();
			await expect(slowRead).resolves.toBeDefined();
			expect(isStorageDegraded('slow-alive-db')).toBe(false);
		});

		// Regression: comparing liveness against the call's start instead of the
		// current window meant one old success disarmed the watchdog permanently —
		// call A starts, call B succeeds, the worker dies, and A re-armed forever.
		it('still condemns a worker that dies after an earlier call succeeded', async () => {
			const wrappedInstance = await wrap('stale-success-db', {
				query: pending(),
				count: jest.fn().mockResolvedValue(1),
			});

			// Order matters: the doomed read must already be outstanding when the
			// other call succeeds, which is what made the old predicate true forever.
			const doomed = wrappedInstance.query({} as any);
			void doomed.catch(() => undefined);
			await jest.advanceTimersByTimeAsync(1_000);
			await expect(wrappedInstance.count({} as any)).resolves.toBe(1);

			// The worker answers nothing from here on.
			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS * 3 + 3);

			expect(isStorageDegraded('stale-success-db')).toBe(true);
		});

		// A worker returning CONFLICT is emphatically alive. Counting only
		// successes let ordinary storage errors read as total silence, condemning a
		// slow read on a perfectly healthy worker.
		it('treats an ordinary storage error as proof the worker is answering', async () => {
			const wrappedInstance = await wrap('erroring-but-alive-db', {
				query: pending(),
				count: jest.fn().mockRejectedValue(new Error('some ordinary storage failure')),
			});

			const slowRead = wrappedInstance.query({} as any);
			void slowRead.catch(() => undefined);
			for (let window = 0; window < 6; window += 1) {
				await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS * 0.5);
				await expect(wrappedInstance.count({} as any)).rejects.toThrow('ordinary storage failure');
				await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS * 0.5);
			}

			expect(isStorageDegraded('erroring-but-alive-db')).toBe(false);
		});

		// Liveness must not be a wall-clock comparison: a backwards clock correction
		// would park a stale marker ahead of every future window and re-arm forever,
		// leaving checkout enabled against a worker that answers nothing.
		it('condemns a dead worker even if the clock jumps backwards', async () => {
			const wrappedInstance = await wrap('clock-rewind-db', {
				query: pending(),
				count: jest.fn().mockResolvedValue(1),
			});

			await expect(wrappedInstance.count({} as any)).resolves.toBe(1);
			const doomed = wrappedInstance.query({} as any);
			void doomed.catch(() => undefined);
			jest.setSystemTime(Date.now() - 60 * 60 * 1000);
			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS * 3 + 3);

			expect(isStorageDegraded('clock-rewind-db')).toBe(true);
		});

		// The watchdog cannot cancel the underlying RPC, so a write must never be
		// told it failed while it may still commit in the worker.
		it('never condemns a write on the clock', async () => {
			const wrappedInstance = await wrap('slow-write-db', { bulkWrite: pending() });

			const write = wrappedInstance.bulkWrite([{ document: { id: '1' } }] as any, 'test');
			let settled = false;
			void write.then(
				() => (settled = true),
				() => (settled = true)
			);
			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS * 10);

			expect(settled).toBe(false);
			expect(isStorageDegraded('slow-write-db')).toBe(false);
		});

		it.each(['close', 'remove', 'cleanup', 'bulkWrite'] as const)(
			'never arms the watchdog for the unbounded %s RPC',
			async (method) => {
				const wrappedInstance = await wrap(`exempt-${method}-db`, { [method]: pending() });

				void (wrappedInstance as any)[method]();
				await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS * 4);

				expect(isStorageDegraded(`exempt-${method}-db`)).toBe(false);
			}
		);

		it('stays quiet for an RPC outstanding when the scope starts closing', async () => {
			const wrappedInstance = await wrap('watchdog-teardown-db', {
				query: pending(),
				close: jest.fn().mockResolvedValue(undefined),
			});

			const inFlight = wrappedInstance.query({} as any);
			void inFlight.catch(() => undefined);
			await wrappedInstance.close();
			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS * 4);

			expect(isStorageDegraded('watchdog-teardown-db')).toBe(false);
		});

		it('does not mistake a forward wall-clock jump for a stalled environment', async () => {
			const wrappedInstance = await wrap('clock-forward-db', { query: pending() });
			const call = wrappedInstance.query({} as any);
			void call.catch(() => undefined);

			jest.setSystemTime(Date.now() + 6 * 60 * 60 * 1000);
			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS + 1);
			expect(isStorageDegraded('clock-forward-db')).toBe(false);

			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS + 1);
			expect(isStorageDegraded('clock-forward-db')).toBe(true);
		});

		// A till whose lid was closed overnight must not wake to a spurious
		// "reload the app": a timer delivered far behind the monotonic clock means
		// the environment stalled, so the worker gets two fresh windows to answer.
		it('re-arms when the environment stalls through the deadline', async () => {
			let monotonicTime = 0;
			jest.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
			const wrappedInstance = await wrap('stalled-environment-db', { query: pending() });
			const call = wrappedInstance.query({} as any);
			void call.catch(() => undefined);

			monotonicTime = STORAGE_RPC_WATCHDOG_MS * 3;
			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS + 1);
			expect(isStorageDegraded('stalled-environment-db')).toBe(false);

			monotonicTime += STORAGE_RPC_WATCHDOG_MS;
			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS + 1);
			expect(isStorageDegraded('stalled-environment-db')).toBe(false);

			monotonicTime += STORAGE_RPC_WATCHDOG_MS;
			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS + 1);
			expect(isStorageDegraded('stalled-environment-db')).toBe(true);
		});

		// A worker that died before startup leaves database creation pending
		// forever, and there is no instance yet to arm a read against — the app just
		// hangs on a spinner.
		it('condemns a worker that never answers database creation', async () => {
			const storage = {
				name: 'mock-storage',
				rxdbVersion: '16.0.0',
				createStorageInstance: jest.fn(() => new Promise(() => undefined)),
			} as unknown as RxStorage<any, any>;

			const creation = wrappedErrorHandlerStorage({ storage }).createStorageInstance({
				databaseName: 'never-opens-db',
			} as any);
			const caught = creation.catch((error: unknown) => error);
			await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS * 2 + 2);

			expect(isStorageWorkerFailure(await caught)).toBe(true);
			expect(isStorageDegraded('never-opens-db')).toBe(true);
		});

		it('leaves no timer behind once a call settles', async () => {
			const wrappedInstance = await wrap('timer-leak-db', {
				query: jest.fn().mockResolvedValue({ documents: [] }),
			});
			const before = jest.getTimerCount();

			await wrappedInstance.query({} as any);
			await wrappedInstance.query({} as any);

			expect(jest.getTimerCount()).toBe(before);
		});
	});
	/**
	 * RxDB starts cleanup from an un-awaited `createRxCollection` hook and chains
	 * every collection of every database onto one process-wide promise
	 * (RXSTORAGE_CLEANUP_QUEUE). A rejection there is both an unhandled rejection
	 * — which raises the dev LogBox overlay — and a poison pill that ends cleanup
	 * for the whole app, so tombstones and the OPFS documents file grow forever.
	 * The wrapper therefore reports cleanup failures and resolves.
	 */
	describe('cleanup containment', () => {
		const workerLoss = () =>
			new Error(
				'could not requestRemote: {"methodName":"cleanup","error":{"message":"worker gone"}}'
			);

		beforeEach(() => {
			clearStorageDegradation();
			resetReportedCleanupFailures();
		});

		afterEach(() => {
			clearStorageDegradation();
			resetReportedCleanupFailures();
		});

		it('passes a successful cleanup result through unchanged', async () => {
			const innerCleanup = jest.fn().mockResolvedValue(false);
			const instance = createMockStorageInstance({ cleanup: innerCleanup });
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'cleanup-ok-db' } as any);

			// `false` means "more to do" — swallowing it would stall compaction.
			await expect(wrappedInstance.cleanup(1000)).resolves.toBe(false);
			expect(innerCleanup).toHaveBeenCalledWith(1000);
		});

		it('resolves done instead of rejecting when cleanup throws', async () => {
			const opfsWhitespaceRow = new Error(
				'could not requestRemote: {"methodName":"cleanup","error":{"name":"TypeError","message":"Cannot read properties of undefined (reading \'_deleted\')"}}'
			);
			const instance = createMockStorageInstance({
				cleanup: jest.fn().mockRejectedValue(opfsWhitespaceRow),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'cleanup-fail-db' } as any);

			// `true` ends this round; RxDB retries on its next cleanup cycle
			// rather than spinning on a failing call.
			await expect(wrappedInstance.cleanup(1000)).resolves.toBe(true);
			expect(mockLoggerInstance.error).toHaveBeenCalled();
		});

		it('reports a failing collection once instead of every cleanup cycle', async () => {
			const instance = createMockStorageInstance({
				cleanup: jest.fn().mockRejectedValue(new Error('cleanup exploded')),
				collectionName: 'products',
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'cleanup-noisy-db' } as any);

			await expect(wrappedInstance.cleanup(1000)).resolves.toBe(true);
			await expect(wrappedInstance.cleanup(1000)).resolves.toBe(true);
			await expect(wrappedInstance.cleanup(1000)).resolves.toBe(true);

			// Every failure writes a log document, whose insert schedules the next
			// cleanup round — reporting each one would feed itself.
			expect(mockLoggerInstance.error).toHaveBeenCalledTimes(1);
		});

		it('re-arms reporting once cleanup completes a round', async () => {
			const innerCleanup = jest
				.fn()
				.mockRejectedValueOnce(new Error('cleanup exploded'))
				.mockResolvedValueOnce(true)
				.mockRejectedValueOnce(new Error('cleanup exploded again'));
			const instance = createMockStorageInstance({ cleanup: innerCleanup });
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'cleanup-rearm-db' } as any);

			await wrappedInstance.cleanup(1000);
			await wrappedInstance.cleanup(1000);
			await wrappedInstance.cleanup(1000);

			// The whitespace-row recovery repairs in place, so a later failure is
			// genuinely new information rather than the same one echoing.
			expect(mockLoggerInstance.error).toHaveBeenCalledTimes(2);
		});

		it('does not treat mid-round progress as a completed round', async () => {
			// The realistic shape of a failing round. RxDB loops while cleanup
			// returns false, and rxdb-premium returns false whenever it relocated
			// documents or drained changelog operations — so the throw arrives
			// after one or more `false`s. Treating those as success would re-arm
			// reporting every round, forever.
			const innerCleanup = jest
				.fn()
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(false)
				.mockRejectedValueOnce(new Error('cleanup exploded'))
				.mockResolvedValueOnce(false)
				.mockRejectedValueOnce(new Error('cleanup exploded'));
			const instance = createMockStorageInstance({ cleanup: innerCleanup });
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'cleanup-progress-db' } as any);

			for (let round = 0; round < 5; round += 1) {
				await wrappedInstance.cleanup(1000);
			}

			expect(mockLoggerInstance.error).toHaveBeenCalledTimes(1);
		});

		it.each(['close', 'remove'] as const)(
			'forgets the report on %s so a re-added collection reports again',
			async (teardown) => {
				const build = async () => {
					const instance = createMockStorageInstance({
						cleanup: jest.fn().mockRejectedValue(new Error('cleanup exploded')),
						close: jest.fn().mockResolvedValue(undefined),
						remove: jest.fn().mockResolvedValue(undefined),
					});
					return wrappedErrorHandlerStorage({
						storage: createMockStorage(instance),
					}).createStorageInstance({ databaseName: `cleanup-${teardown}-db` } as any);
				};

				const before = await build();
				await before.cleanup(1000);
				// Clear & Sync / a store switch tears the instance down and re-adds
				// the same database+collection name — and Clear & Sync is exactly the
				// remedy a cashier runs for this failure.
				await before[teardown]();

				const after = await build();
				await after.cleanup(1000);

				expect(mockLoggerInstance.error).toHaveBeenCalledTimes(2);
			}
		);

		it('reports each failing collection separately', async () => {
			const products = createMockStorageInstance({
				cleanup: jest.fn().mockRejectedValue(new Error('cleanup exploded')),
				collectionName: 'products',
			});
			const orders = createMockStorageInstance({
				cleanup: jest.fn().mockRejectedValue(new Error('cleanup exploded')),
				collectionName: 'orders',
			});
			const wrapProducts = await wrappedErrorHandlerStorage({
				storage: createMockStorage(products),
			}).createStorageInstance({ databaseName: 'cleanup-multi-db' } as any);
			const wrapOrders = await wrappedErrorHandlerStorage({
				storage: createMockStorage(orders),
			}).createStorageInstance({ databaseName: 'cleanup-multi-db' } as any);

			await wrapProducts.cleanup(1000);
			await wrapOrders.cleanup(1000);

			expect(mockLoggerInstance.error).toHaveBeenCalledTimes(2);
		});

		it('still raises the degraded-storage signal when cleanup loses the worker', async () => {
			const instance = createMockStorageInstance({
				cleanup: jest.fn().mockRejectedValue(workerLoss()),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'cleanup-degraded-db' } as any);

			await expect(wrappedInstance.cleanup(1000)).resolves.toBe(true);

			expect(isStorageDegraded('cleanup-degraded-db')).toBe(true);
		});

		/**
		 * Composition with the dead-worker watchdog (#1040). `cleanup` is
		 * deliberately absent from `WATCHDOG_WATCHED_METHODS` — it is unbounded by
		 * design and arming it would false-trip mid-Clear&Sync — so a slow cleanup
		 * must never be condemned by the clock. Pinned here because the two
		 * mechanisms meet on this method: if cleanup were ever added to that set,
		 * the containment below would silently swallow every dead-worker timeout
		 * on it, and that has to be a deliberate choice rather than a side effect.
		 */
		it('never lets the RPC watchdog condemn a slow cleanup', async () => {
			jest.useFakeTimers();
			__resetStorageLivenessForTests();
			try {
				const instance = createMockStorageInstance({
					cleanup: jest.fn(() => new Promise(() => undefined)),
				});
				const wrappedInstance = await wrappedErrorHandlerStorage({
					storage: createMockStorage(instance),
				}).createStorageInstance({ databaseName: 'cleanup-unwatched-db' } as any);

				let settled = false;
				void wrappedInstance.cleanup(1000).then(() => {
					settled = true;
				});
				await jest.advanceTimersByTimeAsync(STORAGE_RPC_WATCHDOG_MS * 4);

				// A long compaction is not a dead worker.
				expect(settled).toBe(false);
				expect(isStorageDegraded('cleanup-unwatched-db')).toBe(false);
				expect(mockLoggerInstance.error).not.toHaveBeenCalled();
			} finally {
				jest.useRealTimers();
			}
		});

		it('contains the disposal-deadline rejection without calling it a storage failure', async () => {
			const instance = createMockStorageInstance({
				cleanup: jest.fn(() => new Promise(() => undefined)),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'cleanup-disposing-db' } as any);
			const cleaning = wrappedInstance.cleanup(1000);

			terminalFailureApi.markStorageTerminallyFailed!('cleanup-disposing-db', 'disposal');

			await expect(cleaning).resolves.toBe(true);
			// markStorageTerminallyFailed logs the disposal itself; the background
			// cleanup that lost its race must not add a second report.
			expect(mockLoggerInstance.error).toHaveBeenCalledTimes(1);
		});

		it('stays quiet when cleanup loses its race against a deliberate teardown', async () => {
			let rejectCleanup: ((error: Error) => void) | undefined;
			const instance = createMockStorageInstance({
				cleanup: jest.fn(() => new Promise((_resolve, reject) => (rejectCleanup = reject))),
				close: jest.fn().mockResolvedValue(undefined),
			});
			const wrappedInstance = await wrappedErrorHandlerStorage({
				storage: createMockStorage(instance),
			}).createStorageInstance({ databaseName: 'cleanup-teardown-db' } as any);

			// A background cleanup is mid-flight when the store switch begins.
			const cleaning = wrappedInstance.cleanup(1000);
			const closed = wrappedInstance.close();
			rejectCleanup!(new Error('instance is closed cleanup-teardown-db-products'));

			await expect(cleaning).resolves.toBe(true);
			await closed;

			expect(mockLoggerInstance.error).not.toHaveBeenCalled();
		});
	});
});
