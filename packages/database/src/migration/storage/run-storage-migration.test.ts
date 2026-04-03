import { migrateStorage } from 'rxdb/plugins/migration-storage';

import { getLogger } from '@wcpos/utils/logger';

import { logStorageMigration, logStorageMigrationError } from './log-migration';
import {
	getMigrationLocalDocId,
	runStorageMigration,
	shouldRunStorageMigration,
} from './run-storage-migration';

jest.mock('rxdb/plugins/migration-storage', () => ({
	migrateStorage: jest.fn(),
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		info: jest.fn(),
		error: jest.fn(),
	})),
}));

const mockLogger = (getLogger as jest.Mock).mock.results[0].value as {
	info: jest.Mock;
	error: jest.Mock;
};

const loggerNamespace = (getLogger as jest.Mock).mock.calls[0]?.[0];

describe('run-storage-migration helpers', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('uses the expected logger namespace and error payload shape', () => {
		expect(loggerNamespace).toEqual(['wcpos', 'db', 'storage-migration']);

		logStorageMigration('storage-migration info', { foo: 'bar' });
		logStorageMigrationError('storage-migration error', { baz: 1 });

		expect(mockLogger.info).toHaveBeenCalledWith('storage-migration info', {
			context: { foo: 'bar' },
		});
		expect(mockLogger.error).toHaveBeenCalledWith('storage-migration error', {
			saveToDb: true,
			context: { baz: 1 },
		});
	});

	it('should not run storage migration when the database names are the same', () => {
		expect(shouldRunStorageMigration({ oldName: 'same', newName: 'same' })).toBe(false);
	});

	it('should build the local migration marker id from the database name', () => {
		expect(getMigrationLocalDocId('store_v3_abc123')).toBe('storage-migration::store_v3_abc123');
	});

	it('skips the runner when the database names match', async () => {
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn(),
			insertLocal: jest.fn(),
			upsertLocal: jest.fn(),
		} as any;

		await runStorageMigration({
			database,
			oldDatabaseName: 'store_v3_abc123',
			oldStorage: { name: 'old-storage' } as any,
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
		});

		expect(database.getLocal).not.toHaveBeenCalled();
		expect(database.insertLocal).not.toHaveBeenCalled();
		expect(migrateStorage).not.toHaveBeenCalled();
		expect(database.upsertLocal).not.toHaveBeenCalled();
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Skipping storage migration because the database names match',
			expect.objectContaining({
				context: expect.objectContaining({
					databaseName: 'store_v3_abc123',
					oldDatabaseName: 'store_v3_abc123',
				}),
			})
		);
	});

	it('skips the runner when an existing marker is cleanup-pending', async () => {
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValue({ data: { status: 'cleanup-pending' } }),
			insertLocal: jest.fn(),
			upsertLocal: jest.fn(),
		} as any;

		await runStorageMigration({
			database,
			oldDatabaseName: 'store_v2_abc123',
			oldStorage: { name: 'old-storage' } as any,
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
		});

		expect(database.getLocal).toHaveBeenCalledWith('storage-migration::store_v3_abc123');
		expect(database.insertLocal).not.toHaveBeenCalled();
		expect(migrateStorage).not.toHaveBeenCalled();
		expect(database.upsertLocal).not.toHaveBeenCalled();
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Skipping storage migration because marker already exists',
			expect.objectContaining({
				context: expect.objectContaining({
					status: 'cleanup-pending',
				}),
			})
		);
	});

	it('retries when the existing marker status is failed', async () => {
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValue({ data: { status: 'failed' } }),
			insertLocal: jest.fn(),
			upsertLocal: jest.fn().mockResolvedValue(undefined),
		} as any;

		(migrateStorage as jest.Mock).mockResolvedValue(undefined);

		await runStorageMigration({
			database,
			oldDatabaseName: 'store_v2_abc123',
			oldStorage: { name: 'old-storage' } as any,
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
		});

		expect(database.upsertLocal).toHaveBeenNthCalledWith(1, 'storage-migration::store_v3_abc123', {
			status: 'pending',
			oldDatabaseName: 'store_v2_abc123',
			newDatabaseName: 'store_v3_abc123',
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
		});
		expect(migrateStorage).toHaveBeenCalled();
		expect(database.upsertLocal).toHaveBeenNthCalledWith(2, 'storage-migration::store_v3_abc123', {
			status: 'cleanup-pending',
			oldDatabaseName: 'store_v2_abc123',
			newDatabaseName: 'store_v3_abc123',
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
			migratedAt: '2026-01-02T03:04:05.000Z',
		});
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Retrying storage migration because marker status is failed',
			expect.objectContaining({
				context: expect.objectContaining({
					status: 'failed',
				}),
			})
		);
	});

	it('skips when an insert race reveals an already-completed marker', async () => {
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest
				.fn()
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce({ data: { status: 'complete' } }),
			insertLocal: jest.fn().mockRejectedValue(new Error('duplicate key')),
			upsertLocal: jest.fn(),
		} as any;

		await runStorageMigration({
			database,
			oldDatabaseName: 'store_v2_abc123',
			oldStorage: { name: 'old-storage' } as any,
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
		});

		expect(database.getLocal).toHaveBeenNthCalledWith(1, 'storage-migration::store_v3_abc123');
		expect(database.getLocal).toHaveBeenNthCalledWith(2, 'storage-migration::store_v3_abc123');
		expect(database.insertLocal).toHaveBeenCalledWith(
			'storage-migration::store_v3_abc123',
			expect.objectContaining({ status: 'pending' })
		);
		expect(migrateStorage).not.toHaveBeenCalled();
		expect(database.upsertLocal).not.toHaveBeenCalled();
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Skipping storage migration because marker already exists',
			expect.objectContaining({
				context: expect.objectContaining({
					status: 'complete',
				}),
			})
		);
	});

	it('continues into retry flow when an insert race reveals a failed marker', async () => {
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest
				.fn()
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce({ data: { status: 'failed' } }),
			insertLocal: jest.fn().mockRejectedValue(new Error('duplicate key')),
			upsertLocal: jest.fn().mockResolvedValue(undefined),
		} as any;

		(migrateStorage as jest.Mock).mockResolvedValue(undefined);

		await runStorageMigration({
			database,
			oldDatabaseName: 'store_v2_abc123',
			oldStorage: { name: 'old-storage' } as any,
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
		});

		expect(database.upsertLocal).toHaveBeenNthCalledWith(1, 'storage-migration::store_v3_abc123', {
			status: 'pending',
			oldDatabaseName: 'store_v2_abc123',
			newDatabaseName: 'store_v3_abc123',
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
		});
		expect(database.upsertLocal).toHaveBeenNthCalledWith(2, 'storage-migration::store_v3_abc123', {
			status: 'cleanup-pending',
			oldDatabaseName: 'store_v2_abc123',
			newDatabaseName: 'store_v3_abc123',
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
			migratedAt: '2026-01-02T03:04:05.000Z',
		});
		expect(migrateStorage).toHaveBeenCalled();
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Retrying storage migration because marker status is failed',
			expect.objectContaining({
				context: expect.objectContaining({
					status: 'failed',
				}),
			})
		);
	});

	it('logs and rethrows when the initial marker lookup fails', async () => {
		const lookupError = new Error('lookup failed');
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockRejectedValue(lookupError),
			insertLocal: jest.fn(),
			upsertLocal: jest.fn(),
		} as any;

		await expect(
			runStorageMigration({
				database,
				oldDatabaseName: 'store_v2_abc123',
				oldStorage: { name: 'old-storage' } as any,
				sourceStorage: 'old-storage',
				targetStorage: 'new-storage',
			})
		).rejects.toThrow('lookup failed');

		expect(mockLogger.error).toHaveBeenCalledWith(
			'Storage migration marker lookup failed',
			expect.objectContaining({
				saveToDb: true,
				context: expect.objectContaining({
					error: 'lookup failed',
					localDocId: 'storage-migration::store_v3_abc123',
				}),
			})
		);
		expect(database.insertLocal).not.toHaveBeenCalled();
		expect(migrateStorage).not.toHaveBeenCalled();
	});

	it('migrates storage and writes a cleanup-pending local marker', async () => {
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValue(null),
			insertLocal: jest.fn().mockResolvedValue(undefined),
			upsertLocal: jest.fn().mockResolvedValue(undefined),
		} as any;

		(migrateStorage as jest.Mock).mockResolvedValue(undefined);

		await runStorageMigration({
			database,
			oldDatabaseName: 'store_v2_abc123',
			oldStorage: { name: 'old-storage' } as any,
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
		});

		expect(database.insertLocal).toHaveBeenCalledWith(
			'storage-migration::store_v3_abc123',
			expect.objectContaining({ status: 'pending' })
		);
		expect(migrateStorage).toHaveBeenCalledWith({
			database,
			oldDatabaseName: 'store_v2_abc123',
			oldStorage: { name: 'old-storage' },
			batchSize: 500,
			parallel: false,
		});

		expect(database.upsertLocal).toHaveBeenCalledWith('storage-migration::store_v3_abc123', {
			status: 'cleanup-pending',
			oldDatabaseName: 'store_v2_abc123',
			newDatabaseName: 'store_v3_abc123',
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
			migratedAt: '2026-01-02T03:04:05.000Z',
		});
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Storage migration completed',
			expect.objectContaining({
				context: expect.objectContaining({
					status: 'cleanup-pending',
				}),
			})
		);
	});

	it('logs and rethrows when the migration fails', async () => {
		const migrationError = new Error('migration exploded');
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValue(null),
			insertLocal: jest.fn().mockResolvedValue(undefined),
			upsertLocal: jest.fn().mockResolvedValue(undefined),
		} as any;

		(migrateStorage as jest.Mock).mockRejectedValue(migrationError);

		await expect(
			runStorageMigration({
				database,
				oldDatabaseName: 'store_v2_abc123',
				oldStorage: { name: 'old-storage' } as any,
				sourceStorage: 'old-storage',
				targetStorage: 'new-storage',
			})
		).rejects.toThrow('migration exploded');

		expect(database.upsertLocal).toHaveBeenCalledWith(
			'storage-migration::store_v3_abc123',
			expect.objectContaining({ status: 'failed' })
		);
		expect(mockLogger.error).toHaveBeenCalledWith(
			'Storage migration failed',
			expect.objectContaining({
				saveToDb: true,
				context: expect.objectContaining({
					error: 'migration exploded',
				}),
			})
		);
	});

	it('logs and rethrows when marker bookkeeping fails after a successful migration', async () => {
		const bookkeepingError = new Error('marker write failed');
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValue(null),
			insertLocal: jest.fn().mockResolvedValue(undefined),
			upsertLocal: jest
				.fn()
				.mockRejectedValueOnce(bookkeepingError)
				.mockResolvedValueOnce(undefined),
		} as any;

		(migrateStorage as jest.Mock).mockResolvedValue(undefined);

		await expect(
			runStorageMigration({
				database,
				oldDatabaseName: 'store_v2_abc123',
				oldStorage: { name: 'old-storage' } as any,
				sourceStorage: 'old-storage',
				targetStorage: 'new-storage',
			})
		).rejects.toThrow('marker write failed');

		expect(database.upsertLocal).toHaveBeenNthCalledWith(1, 'storage-migration::store_v3_abc123', {
			status: 'cleanup-pending',
			oldDatabaseName: 'store_v2_abc123',
			newDatabaseName: 'store_v3_abc123',
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
			migratedAt: '2026-01-02T03:04:05.000Z',
		});
		expect(database.upsertLocal).toHaveBeenNthCalledWith(2, 'storage-migration::store_v3_abc123', {
			status: 'failed',
			oldDatabaseName: 'store_v2_abc123',
			newDatabaseName: 'store_v3_abc123',
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
		});
		expect(mockLogger.error).toHaveBeenCalledWith(
			'Storage migration completed but bookkeeping failed',
			expect.objectContaining({
				saveToDb: true,
				context: expect.objectContaining({
					error: 'marker write failed',
					localDocId: 'storage-migration::store_v3_abc123',
				}),
			})
		);
	});
});
