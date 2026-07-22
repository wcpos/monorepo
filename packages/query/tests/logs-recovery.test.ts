import {
	isRecoverableLogsStorageError,
	recoverEngineCollectionStorage,
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
				removeItem(key: string) {
					this.store.delete(key);
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

	it('resets one corrupted server-backed collection per scope and reloads once', async () => {
		const resetCollection = jest.fn(
			async (
				_collection: string,
				options?: { beforeDrop?: (active: { scopeId: string }) => Promise<void> }
			) => {
				await options?.beforeDrop?.({ scopeId: 'store-7' });
				return 'reset' as const;
			}
		);
		const engine = { active: () => ({ scopeId: 'store-7' }), scope: { resetCollection } };
		const reload = jest.fn();
		const error = new Error('could not requestRemote: SyntaxError: value is not valid JSON');

		await expect(
			recoverEngineCollectionStorage(engine as never, 'products', error, { reload })
		).resolves.toBe(true);
		await expect(
			recoverEngineCollectionStorage(engine as never, 'products', error, { reload })
		).resolves.toBe(false);

		expect(resetCollection).toHaveBeenCalledTimes(1);
		expect(resetCollection).toHaveBeenCalledWith(
			'products',
			expect.objectContaining({ beforeDrop: expect.any(Function) })
		);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('keeps recovery guards independent across store scopes', async () => {
		let scopeId = 'store-a';
		const resetCollection = jest.fn(
			async (
				_collection: string,
				options?: { beforeDrop?: (active: { scopeId: string }) => Promise<void> }
			) => {
				await options?.beforeDrop?.({ scopeId });
				return 'reset' as const;
			}
		);
		const engine = { active: () => ({ scopeId }), scope: { resetCollection } };
		const error = new Error('could not requestRemote: SyntaxError: value is not valid JSON');

		await recoverEngineCollectionStorage(engine as never, 'orders', error, { reload: jest.fn() });
		scopeId = 'store-b';
		await expect(
			recoverEngineCollectionStorage(engine as never, 'orders', error, { reload: jest.fn() })
		).resolves.toBe(true);
		expect(resetCollection).toHaveBeenCalledTimes(2);
	});

	it('allows a later recovery attempt when reset fails after claiming the guard', async () => {
		const resetError = new Error('drop failed');
		const resetCollection = jest.fn(
			async (
				_collection: string,
				options: { beforeDrop: (active: { scopeId: string }) => Promise<void> }
			) => {
				await options.beforeDrop({ scopeId: 'store-a' });
				throw resetError;
			}
		);
		const engine = {
			active: () => ({ scopeId: 'store-a' }),
			scope: { resetCollection },
		};
		const error = new Error('could not requestRemote: SyntaxError: value is not valid JSON');

		await expect(recoverEngineCollectionStorage(engine as never, 'orders', error)).rejects.toBe(
			resetError
		);
		await expect(recoverEngineCollectionStorage(engine as never, 'orders', error)).rejects.toBe(
			resetError
		);

		expect(resetCollection).toHaveBeenCalledTimes(2);
	});

	it('keeps a successful recovery guard when a duplicate reset is rejected', async () => {
		const pending: {
			options: { beforeDrop: (active: { scopeId: string }) => Promise<void> };
			resolve: () => void;
			reject: (error: unknown) => void;
		}[] = [];
		const resetCollection = jest.fn(
			(_collection, options) =>
				new Promise<void>((resolve, reject) => pending.push({ options, resolve, reject }))
		);
		const engine = {
			active: () => ({ scopeId: 'store-a' }),
			scope: { resetCollection },
		};
		const error = new Error('could not requestRemote: SyntaxError: value is not valid JSON');

		const first = recoverEngineCollectionStorage(engine as never, 'orders', error, {
			reload: jest.fn(),
		});
		const duplicate = recoverEngineCollectionStorage(engine as never, 'orders', error);
		await pending[0]!.options.beforeDrop({ scopeId: 'store-a' });
		await pending[1]!.options.beforeDrop({ scopeId: 'store-a' }).catch(pending[1]!.reject);
		await expect(duplicate).rejects.toBe(error);

		expect(
			globalThis.sessionStorage.getItem('wcpos_engine_storage_recovery_attempted_store-a_orders')
		).toBe('1');
		pending[0]!.resolve();
		await expect(first).resolves.toBe(true);
	});

	it('does not reset a collection after the active store changes', async () => {
		const resetCollection = jest.fn(
			async (
				_collection: string,
				options?: { beforeDrop?: (active: { scopeId: string }) => Promise<void> }
			) => {
				await options?.beforeDrop?.({ scopeId: 'store-b' });
				return 'reset' as const;
			}
		);
		const engine = { active: () => ({ scopeId: 'store-a' }), scope: { resetCollection } };
		const reload = jest.fn();
		const error = new Error('could not requestRemote: SyntaxError: value is not valid JSON');

		await expect(
			recoverEngineCollectionStorage(engine as never, 'orders', error, { reload })
		).rejects.toBe(error);
		expect(reload).not.toHaveBeenCalled();
	});
});
