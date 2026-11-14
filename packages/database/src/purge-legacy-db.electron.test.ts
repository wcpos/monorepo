const mockError = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ error: mockError }),
}));

describe('Electron legacy purge', () => {
	it('returns the main-process result from one IPC invocation', async () => {
		const result = { success: true, databasesDeleted: 3 };
		const invoke = jest.fn(async () => result);
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: { ipcRenderer: { invoke } },
		});
		const { purgeLegacyDatabases } = await import('./purge-legacy-db.electron');
		await expect(purgeLegacyDatabases()).resolves.toBe(result);
		expect(invoke).toHaveBeenCalledTimes(1);
		expect(invoke).toHaveBeenCalledWith('purgeLegacyDatabases');
	});
	it('logs an IPC rejection rather than throwing', async () => {
		const invoke = jest.fn(async () => {
			throw new Error('main failed');
		});
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: { ipcRenderer: { invoke } },
		});
		const { purgeLegacyDatabases } = await import('./purge-legacy-db.electron');
		await expect(purgeLegacyDatabases()).resolves.toBeUndefined();
		expect(mockError).toHaveBeenCalledWith('Failed to purge legacy databases', expect.any(Object));
	});
});
