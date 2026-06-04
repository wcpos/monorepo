import {
	isRecoverableLogsStorageError,
	recoverLogsCollectionStorage,
} from '../src/logs-storage-recovery';

describe('logs storage recovery', () => {
	const originalSessionStorage = globalThis.sessionStorage;

	beforeEach(() => {
		Object.defineProperty(globalThis, 'sessionStorage', {
			configurable: true,
			value: {
				store: new Map<string, string>(),
				getItem(key: string) {
					return this.store.get(key) ?? null;
				},
				setItem(key: string, value: string) {
					this.store.set(key, value);
				},
			},
		});
	});

	afterEach(() => {
		Object.defineProperty(globalThis, 'sessionStorage', {
			configurable: true,
			value: originalSessionStorage,
		});
		jest.clearAllMocks();
	});

	it('detects OPFS/RxDB JSON parse corruption errors from requestRemote', () => {
		const error = new Error(
			'could not requestRemote: {"methodName":"query","error":{"name":"SyntaxError","message":"Expected \':\' after property name in JSON at position 1263252"}}'
		);

		expect(isRecoverableLogsStorageError(error)).toBe(true);
	});

	it('does not treat ordinary query errors as recoverable storage corruption', () => {
		const error = new Error('could not requestRemote: network timeout');

		expect(isRecoverableLogsStorageError(error)).toBe(false);
	});

	it('removes only the logs collection and reloads once', async () => {
		const remove = jest.fn(async () => undefined);
		const logsCollection = { name: 'logs', remove };

		const reload = jest.fn();

		const recovered = await recoverLogsCollectionStorage(
			logsCollection,
			new Error('could not requestRemote: SyntaxError: Expected JSON parse failure'),
			{
				reload,
			}
		);

		expect(recovered).toBe(true);
		expect(remove).toHaveBeenCalledTimes(1);
		expect(globalThis.sessionStorage.getItem('wcpos_logs_storage_recovery_attempted')).toBe('1');
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('does not recover non-log collections', async () => {
		const remove = jest.fn(async () => undefined);
		const productsCollection = { name: 'products', remove };

		const recovered = await recoverLogsCollectionStorage(
			productsCollection,
			new Error('could not requestRemote: SyntaxError: Expected JSON parse failure')
		);

		expect(recovered).toBe(false);
		expect(remove).not.toHaveBeenCalled();
	});

	it('does not loop recovery after one attempt in the same browser session', async () => {
		globalThis.sessionStorage.setItem('wcpos_logs_storage_recovery_attempted', '1');
		const remove = jest.fn(async () => undefined);
		const logsCollection = { name: 'logs', remove };

		const recovered = await recoverLogsCollectionStorage(
			logsCollection,
			new Error('could not requestRemote: SyntaxError: Expected JSON parse failure')
		);

		expect(recovered).toBe(false);
		expect(remove).not.toHaveBeenCalled();
	});

	it('does not set the session flag when logs collection removal fails', async () => {
		const removeError = new Error('remove failed');
		const remove = jest.fn(async () => {
			throw removeError;
		});
		const logsCollection = { name: 'logs', remove };
		const reload = jest.fn();

		await expect(
			recoverLogsCollectionStorage(
				logsCollection,
				new Error('could not requestRemote: SyntaxError: Expected JSON parse failure'),
				{
					reload,
				}
			)
		).rejects.toThrow(removeError);

		expect(remove).toHaveBeenCalledTimes(1);
		expect(globalThis.sessionStorage.getItem('wcpos_logs_storage_recovery_attempted')).toBeNull();
		expect(reload).not.toHaveBeenCalled();
	});
});
