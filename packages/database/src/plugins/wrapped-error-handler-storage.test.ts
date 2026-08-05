// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

import { getLogger } from '@wcpos/utils/logger';

import {
	clearStorageDegradation,
	degradedStorage$,
	isStorageDegraded,
	isStorageWorkerFailure,
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
				'Storage worker error in findDocumentsById',
				expect.objectContaining({
					context: expect.objectContaining({
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
				'Storage worker error in findDocumentsById',
				expect.any(Object)
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
				'Storage worker error in findDocumentsById',
				expect.objectContaining({
					context: expect.objectContaining({
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
				findDocumentsById: jest.fn().mockRejectedValue(new Error('could not requestRemote')),
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

		it('drops the latch when the database scope closes (store switch reopens clean)', async () => {
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

			expect(isStorageDegraded('closing-db')).toBe(false);
			expect(latest()).toEqual([]);
		});

		it('recognises worker-loss errors for callers that must fail loudly', () => {
			expect(isStorageWorkerFailure(workerLoss())).toBe(true);
			expect(isStorageWorkerFailure(new Error('CONFLICT'))).toBe(false);
			expect(isStorageWorkerFailure('could not requestRemote: string form')).toBe(true);
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

		// A collection reset removes and recreates the instance; without unregistering
		// on remove the state would be stranded and the latch pinned forever.
		it('drops the latch when a collection reset removes the instance', async () => {
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

			expect(isStorageDegraded('reset-db')).toBe(false);
		});
	});
});
