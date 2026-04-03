const mockCleanupOldDatabase = jest.fn();

jest.mock('./cleanup', () => ({
	cleanupOldDatabase: (...args: unknown[]) => mockCleanupOldDatabase(...args),
}));

describe('verifyStorageMigration', () => {
	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('cleans up the old database and marks the migration complete on a later launch', async () => {
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValue({
				data: {
					status: 'cleanup-pending',
					oldDatabaseName: 'store_v2_abc123',
					newDatabaseName: 'store_v3_abc123',
					sourceStorage: 'sqlite-ipc',
					targetStorage: 'filesystem-node-ipc',
					migratedAt: '2026-01-01T00:00:00.000Z',
				},
			}),
			upsertLocal: jest.fn().mockResolvedValue(undefined),
		} as any;

		const { verifyStorageMigration, getMigrationLocalDocId } = await import('./verify-migration');

		await verifyStorageMigration({
			database,
			oldDatabaseName: 'store_v2_abc123',
			sourceStorage: 'sqlite-ipc',
			targetStorage: 'filesystem-node-ipc',
		});

		expect(database.getLocal).toHaveBeenCalledWith('storage-migration::store_v3_abc123');
		expect(mockCleanupOldDatabase).toHaveBeenCalledWith('store_v2_abc123');
		expect(database.upsertLocal).toHaveBeenCalledWith(
			getMigrationLocalDocId('store_v3_abc123'),
			expect.objectContaining({
				status: 'complete',
				oldDatabaseName: 'store_v2_abc123',
				newDatabaseName: 'store_v3_abc123',
				sourceStorage: 'sqlite-ipc',
				targetStorage: 'filesystem-node-ipc',
				migratedAt: '2026-01-01T00:00:00.000Z',
				cleanupAt: '2026-01-02T03:04:05.000Z',
			})
		);
	});

	it('cleans up a cleanup-pending marker returned as a local doc via toJSON().data', async () => {
		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValue({
				toJSON: () => ({
					data: {
						status: 'cleanup-pending',
						oldDatabaseName: 'store_v2_abc123',
						newDatabaseName: 'store_v3_abc123',
						sourceStorage: 'sqlite-ipc',
						targetStorage: 'filesystem-node-ipc',
						migratedAt: '2026-01-01T00:00:00.000Z',
					},
				}),
			}),
			upsertLocal: jest.fn().mockResolvedValue(undefined),
		} as any;

		const { verifyStorageMigration, getMigrationLocalDocId } = await import('./verify-migration');

		await verifyStorageMigration({
			database,
			oldDatabaseName: 'store_v2_abc123',
			sourceStorage: 'sqlite-ipc',
			targetStorage: 'filesystem-node-ipc',
		});

		expect(database.getLocal).toHaveBeenCalledWith('storage-migration::store_v3_abc123');
		expect(mockCleanupOldDatabase).toHaveBeenCalledWith('store_v2_abc123');
		expect(database.upsertLocal).toHaveBeenCalledWith(
			getMigrationLocalDocId('store_v3_abc123'),
			expect.objectContaining({
				status: 'complete',
				oldDatabaseName: 'store_v2_abc123',
				newDatabaseName: 'store_v3_abc123',
				sourceStorage: 'sqlite-ipc',
				targetStorage: 'filesystem-node-ipc',
				migratedAt: '2026-01-01T00:00:00.000Z',
				cleanupAt: '2026-01-02T03:04:05.000Z',
			})
		);
	});

	it('skips deferred cleanup when the marker was created during the current launch', async () => {
		const launchStartedAt = new Date('2026-01-02T03:04:05.000Z');
		jest.setSystemTime(launchStartedAt);

		const { verifyStorageMigration } = await import('./verify-migration');

		jest.setSystemTime(new Date('2026-01-02T03:04:06.000Z'));

		const database = {
			name: 'store_v3_abc123',
			getLocal: jest.fn().mockResolvedValue({
				data: {
					status: 'cleanup-pending',
					oldDatabaseName: 'store_v2_abc123',
					newDatabaseName: 'store_v3_abc123',
					sourceStorage: 'sqlite-ipc',
					targetStorage: 'filesystem-node-ipc',
					migratedAt: '2026-01-02T03:04:06.000Z',
				},
			}),
			upsertLocal: jest.fn().mockResolvedValue(undefined),
		} as any;

		await verifyStorageMigration({
			database,
			oldDatabaseName: 'store_v2_abc123',
			sourceStorage: 'sqlite-ipc',
			targetStorage: 'filesystem-node-ipc',
		});

		expect(mockCleanupOldDatabase).not.toHaveBeenCalled();
		expect(database.upsertLocal).not.toHaveBeenCalled();
	});
});
