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
const createLocalMarkerDoc = (data: Record<string, any>) => ({
	toJSON: () => ({
		id: 'storage-migration::store_v3_abc123',
		data,
	}),
});

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
		const prepareOldDatabase = jest.fn();
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
			prepareOldDatabase,
		});

		expect(database.getLocal).toHaveBeenCalledWith('storage-migration::store_v3_abc123');
		expect(prepareOldDatabase).not.toHaveBeenCalled();
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
		const existingMarker = {
			data: { status: 'failed' },
			incrementalModify: jest.fn(async (mutate: (data: any) => any) => ({
				data: mutate({ status: 'failed' }),
			})),
		};
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValue(existingMarker),
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

		expect(existingMarker.incrementalModify).toHaveBeenCalledTimes(1);
		expect(migrateStorage).toHaveBeenCalled();
		expect(database.upsertLocal).toHaveBeenCalledTimes(1);
		expect(database.upsertLocal).toHaveBeenNthCalledWith(1, 'storage-migration::store_v3_abc123', {
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

	it('retries immediately after claiming a failed marker even when incrementalModify returns a stale local-doc shape', async () => {
		let claimedData: Record<string, any> = { status: 'failed' };
		const existingMarker = {
			...createLocalMarkerDoc({ status: 'failed' }),
			incrementalModify: jest.fn(async (mutate: (data: any) => any) => {
				claimedData = mutate({ status: 'failed' });
				return createLocalMarkerDoc({ status: 'failed' });
			}),
		};
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest
				.fn()
				.mockResolvedValueOnce(existingMarker)
				.mockImplementationOnce(async () => createLocalMarkerDoc(claimedData)),
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

		expect(database.getLocal).toHaveBeenCalledTimes(2);
		expect(existingMarker.incrementalModify).toHaveBeenCalledTimes(1);
		expect(migrateStorage).toHaveBeenCalledTimes(1);
		expect(mockLogger.info).not.toHaveBeenCalledWith(
			'Skipping storage migration because marker status is unrecognized',
			expect.anything()
		);
	});

	it('retries immediately after claiming a stale pending marker even when incrementalModify returns a stale local-doc shape', async () => {
		const stalePendingData = {
			status: 'pending',
			startedAt: '2026-01-01T03:04:05.000Z',
			ownerId: 'other-owner',
		};
		let claimedData: Record<string, any> = stalePendingData;
		const existingMarker = {
			...createLocalMarkerDoc(stalePendingData),
			incrementalModify: jest.fn(async (mutate: (data: any) => any) => {
				claimedData = mutate(stalePendingData);
				return createLocalMarkerDoc(stalePendingData);
			}),
		};
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest
				.fn()
				.mockResolvedValueOnce(existingMarker)
				.mockImplementationOnce(async () => createLocalMarkerDoc(claimedData)),
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

		expect(database.getLocal).toHaveBeenCalledTimes(2);
		expect(existingMarker.incrementalModify).toHaveBeenCalledTimes(1);
		expect(migrateStorage).toHaveBeenCalledTimes(1);
		expect(mockLogger.info).not.toHaveBeenCalledWith(
			'Skipping storage migration because marker status is unrecognized',
			expect.anything()
		);
	});

	it('retries when the existing marker status is pending', async () => {
		const existingMarker = {
			data: { status: 'pending', startedAt: '2026-01-01T03:04:05.000Z' },
			incrementalModify: jest.fn(async (mutate: (data: any) => any) => ({
				data: mutate({ status: 'pending', startedAt: '2026-01-01T03:04:05.000Z' }),
			})),
		};
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValue(existingMarker),
			insertLocal: jest.fn(),
			upsertLocal: jest.fn().mockResolvedValue(undefined),
		} as any;
		const prepareOldDatabase = jest.fn();

		(migrateStorage as jest.Mock).mockResolvedValue(undefined);

		await runStorageMigration({
			database,
			oldDatabaseName: 'store_v2_abc123',
			oldStorage: { name: 'old-storage' } as any,
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
			prepareOldDatabase,
		});

		expect(prepareOldDatabase).toHaveBeenCalledTimes(1);
		expect(existingMarker.incrementalModify).toHaveBeenCalledTimes(1);
		expect(migrateStorage).toHaveBeenCalled();
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Retrying storage migration because marker status is pending',
			expect.objectContaining({
				context: expect.objectContaining({
					status: 'pending',
				}),
			})
		);
	});

	it('skips when another launch refreshes a stale pending marker during the retry claim', async () => {
		const refreshedMarker = {
			data: {
				status: 'pending',
				startedAt: '2026-01-02T03:00:05.000Z',
				ownerId: 'other-owner-fresh',
			},
		};
		const existingMarker = {
			data: {
				status: 'pending',
				startedAt: '2026-01-01T03:04:05.000Z',
				ownerId: 'other-owner',
			},
			incrementalModify: jest.fn(async () => refreshedMarker),
		};
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest
				.fn()
				.mockResolvedValueOnce(existingMarker)
				.mockResolvedValueOnce(refreshedMarker),
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

		expect(existingMarker.incrementalModify).toHaveBeenCalledTimes(1);
		expect(database.insertLocal).not.toHaveBeenCalled();
		expect(database.upsertLocal).not.toHaveBeenCalled();
		expect(migrateStorage).not.toHaveBeenCalled();
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Skipping storage migration because marker is already pending in another active launch',
			expect.objectContaining({
				context: expect.objectContaining({
					status: 'pending',
					ownerId: 'other-owner-fresh',
				}),
			})
		);
	});

	it('skips when an existing pending marker from another launch is still within the lease window', async () => {
		const prepareOldDatabase = jest.fn();
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValue({
				data: {
					status: 'pending',
					startedAt: '2026-01-02T03:00:05.000Z',
					ownerId: 'other-owner',
				},
			}),
			insertLocal: jest.fn(),
			upsertLocal: jest.fn(),
		} as any;

		await runStorageMigration({
			database,
			oldDatabaseName: 'store_v2_abc123',
			oldStorage: { name: 'old-storage' } as any,
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
			prepareOldDatabase,
		});

		expect(prepareOldDatabase).not.toHaveBeenCalled();
		expect(database.insertLocal).not.toHaveBeenCalled();
		expect(database.upsertLocal).not.toHaveBeenCalled();
		expect(migrateStorage).not.toHaveBeenCalled();
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Skipping storage migration because marker is already pending in another active launch',
			expect.objectContaining({
				context: expect.objectContaining({
					status: 'pending',
					ownerId: 'other-owner',
				}),
			})
		);
	});

	it('awaits prepareOldDatabase before starting migrateStorage', async () => {
		const sequence: string[] = [];
		let resolvePrepare!: () => void;
		const preparePromise = new Promise<void>((resolve) => {
			resolvePrepare = resolve;
		});
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValue(null),
			insertLocal: jest.fn().mockImplementation(async () => {
				sequence.push('reserve-pending');
			}),
			upsertLocal: jest.fn().mockResolvedValue(undefined),
		} as any;
		const prepareOldDatabase = jest.fn(async () => {
			sequence.push('prepare-start');
			await preparePromise;
			sequence.push('prepare-end');
		});

		(migrateStorage as jest.Mock).mockImplementation(async () => {
			sequence.push('migrate');
		});

		const runPromise = runStorageMigration({
			database,
			oldDatabaseName: 'store_v2_abc123',
			oldStorage: { name: 'old-storage' } as any,
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
			prepareOldDatabase,
		} as any);

		await Promise.resolve();
		await Promise.resolve();

		expect(database.insertLocal).toHaveBeenCalledTimes(1);
		expect(prepareOldDatabase).toHaveBeenCalledTimes(1);
		expect(sequence).toEqual(['reserve-pending', 'prepare-start']);
		expect(migrateStorage).not.toHaveBeenCalled();

		resolvePrepare();
		await runPromise;

		expect(sequence).toEqual(['reserve-pending', 'prepare-start', 'prepare-end', 'migrate']);
	});

	it('skips when an insert race conflict payload already contains a cleanup-pending marker', async () => {
		const conflictError = {
			isError: true,
			status: 409,
			documentId: 'storage-migration::store_v3_abc123',
			documentInDb: {
				id: 'storage-migration::store_v3_abc123',
				data: {
					status: 'cleanup-pending',
					oldDatabaseName: 'store_v2_abc123',
					newDatabaseName: 'store_v3_abc123',
					sourceStorage: 'old-storage',
					targetStorage: 'new-storage',
					migratedAt: '2026-01-02T03:04:05.000Z',
				},
			},
		};
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
			insertLocal: jest.fn().mockRejectedValue(conflictError),
			upsertLocal: jest.fn(),
		} as any;

		await runStorageMigration({
			database,
			oldDatabaseName: 'store_v2_abc123',
			oldStorage: { name: 'old-storage' } as any,
			sourceStorage: 'old-storage',
			targetStorage: 'new-storage',
		});

		expect(database.getLocal).toHaveBeenCalledTimes(1);
		expect(database.insertLocal).toHaveBeenCalledTimes(1);
		expect(database.upsertLocal).not.toHaveBeenCalled();
		expect(migrateStorage).not.toHaveBeenCalled();
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Skipping storage migration because marker already exists',
			expect.objectContaining({
				context: expect.objectContaining({
					status: 'cleanup-pending',
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
		const failedMarker = {
			data: { status: 'failed' },
			incrementalModify: jest.fn(async (mutate: (data: any) => any) => ({
				data: mutate({ status: 'failed' }),
			})),
		};
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(failedMarker),
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

		expect(failedMarker.incrementalModify).toHaveBeenCalledTimes(1);
		expect(database.upsertLocal).toHaveBeenCalledTimes(1);
		expect(database.upsertLocal).toHaveBeenNthCalledWith(1, 'storage-migration::store_v3_abc123', {
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

	it('falls back to getLocal when a retryable insert-race conflict payload is a plain document', async () => {
		const failedMarker = {
			data: { status: 'failed' },
			incrementalModify: jest.fn(async (mutate: (data: any) => any) => ({
				data: mutate({ status: 'failed' }),
			})),
		};
		const conflictError = {
			isError: true,
			status: 409,
			documentId: 'storage-migration::store_v3_abc123',
			documentInDb: {
				id: 'storage-migration::store_v3_abc123',
				data: { status: 'failed' },
			},
		};
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(failedMarker),
			insertLocal: jest.fn().mockRejectedValue(conflictError),
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

		expect(database.getLocal).toHaveBeenCalledTimes(2);
		expect(failedMarker.incrementalModify).toHaveBeenCalledTimes(1);
		expect(migrateStorage).toHaveBeenCalled();
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
