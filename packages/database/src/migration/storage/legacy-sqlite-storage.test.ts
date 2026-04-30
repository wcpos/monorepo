const mockEnsureParams = jest.fn();
const mockCreateSQLiteStorageInstance = jest.fn();
const mockOriginalCreateStorageInstance = jest.fn();

jest.mock('rxdb/plugins/core', () => ({
	ensureRxStorageInstanceParamsAreCorrect: (params: unknown) => mockEnsureParams(params),
}));

jest.mock(
	'rxdb-premium-old/plugins/storage-sqlite',
	() => ({
		getRxStorageSQLite: jest.fn((settings: unknown) => ({
			name: 'sqlite',
			rxdbVersion: '16.21.1',
			settings,
			createStorageInstance: (...args: unknown[]) => mockOriginalCreateStorageInstance(...args),
			base64AttachmentToStoredAttachmentsData: jest.fn(),
			storedAttachmentsDataToBase64: jest.fn(),
		})),
		createSQLiteStorageInstance: (...args: unknown[]) => mockCreateSQLiteStorageInstance(...args),
	}),
	{ virtual: true }
);

describe('getLegacyMigrationRxStorageSQLite', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('bypasses the old premium version check and delegates directly to createSQLiteStorageInstance', async () => {
		const { getLegacyMigrationRxStorageSQLite } = await import('./legacy-sqlite-storage');
		const settings = { sqliteBasics: { open: jest.fn() } };
		const params = { databaseName: 'legacy-db' };
		const expectedInstance = { ok: true };
		mockCreateSQLiteStorageInstance.mockResolvedValue(expectedInstance);
		mockOriginalCreateStorageInstance.mockRejectedValue(new Error('Version mismatch detected'));

		const storage = getLegacyMigrationRxStorageSQLite(settings as never);
		const result = await storage.createStorageInstance(params as never);

		expect(result).toBe(expectedInstance);
		expect(mockOriginalCreateStorageInstance).not.toHaveBeenCalled();
		expect(mockEnsureParams).toHaveBeenCalledWith(params);
		expect(mockCreateSQLiteStorageInstance).toHaveBeenCalledWith(storage, params, settings);
	});

	it('preserves RxDB storage-instance parameter validation', async () => {
		const { getLegacyMigrationRxStorageSQLite } = await import('./legacy-sqlite-storage');
		const settings = { sqliteBasics: { open: jest.fn() } };
		const params = { databaseName: 'legacy-db' };
		const validationError = new Error('invalid params');
		mockEnsureParams.mockImplementation(() => {
			throw validationError;
		});

		const storage = getLegacyMigrationRxStorageSQLite(settings as never);

		await expect(storage.createStorageInstance(params as never)).rejects.toThrow(validationError);
		expect(mockOriginalCreateStorageInstance).not.toHaveBeenCalled();
		expect(mockCreateSQLiteStorageInstance).not.toHaveBeenCalled();
	});

	it('normalizes legacy base64 attachment reads to Blob instances', async () => {
		const { getLegacyMigrationRxStorageSQLite } = await import('./legacy-sqlite-storage');
		const settings = { sqliteBasics: { open: jest.fn() } };
		const params = { databaseName: 'legacy-db' };
		const legacyGetAttachmentData = jest.fn(async () =>
			Buffer.from('hello world').toString('base64')
		);
		mockEnsureParams.mockImplementation(() => undefined);
		mockCreateSQLiteStorageInstance.mockResolvedValue({
			getAttachmentData: legacyGetAttachmentData,
		});

		const storage = getLegacyMigrationRxStorageSQLite(settings as never);
		const instance = (await storage.createStorageInstance(params as never)) as unknown as {
			getAttachmentData: (
				documentId: string,
				attachmentId: string,
				digest: string
			) => Promise<Blob>;
		};
		const attachment = await instance.getAttachmentData('doc-1', 'attachment-1', 'digest-1');

		expect(legacyGetAttachmentData).toHaveBeenCalledWith('doc-1', 'attachment-1', 'digest-1');
		expect(attachment).toBeInstanceOf(Blob);
		expect(await attachment.text()).toBe('hello world');
	});
});
