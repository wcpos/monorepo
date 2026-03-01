// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

import { getLogger } from '@wcpos/utils/logger';

import { wrappedErrorHandlerStorage } from './wrapped-error-handler-storage';

import type { RxStorage, RxStorageInstance } from 'rxdb';

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
		schema: { primaryKey: 'id' },
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
			const error = new Error('could not requestRemote');
			const instance = createMockStorageInstance({
				findDocumentsById: jest.fn().mockRejectedValue(error),
			});
			const storage = createMockStorage(instance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			await expect(wrappedInstance.findDocumentsById(['1'], false)).rejects.toThrow(
				'could not requestRemote'
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

			expect(result.error[0].documentInDb).toEqual(writes[0].document);
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

			expect(result.error[0].documentInDb).toEqual(prev);
		});

		it('should handle composite primary keys in error response', async () => {
			const compositeInstance = createMockStorageInstance({
				schema: { primaryKey: { key: 'syncId', fields: ['endpoint', 'id'], separator: '|' } },
				bulkWrite: jest.fn().mockRejectedValue(new Error('CONFLICT')),
			});
			const storage = createMockStorage(compositeInstance);
			const wrapped = wrappedErrorHandlerStorage({ storage });
			const wrappedInstance = await wrapped.createStorageInstance({} as any);

			const writes = [{ document: { syncId: 'orders|42', endpoint: 'orders', id: 42 }, previous: undefined }];
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
});
