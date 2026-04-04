describe('cleanupOldWebDatabase', () => {
	const setIndexedDb = (deleteDatabase: any) => {
		(globalThis as any).indexedDB = {
			deleteDatabase,
		};
	};

	beforeEach(() => {
		jest.resetModules();
	});

	it('deletes the legacy IndexedDB database name directly', async () => {
		const deleteDatabase = jest.fn(() => {
			const request: {
				onsuccess?: ((event: Event) => void) | null;
				onerror?: ((event: Event) => void) | null;
				onblocked?: ((event: Event) => void) | null;
			} = {};

			queueMicrotask(() => {
				request.onsuccess?.(new Event('success'));
			});

			return request;
		});

		setIndexedDb(deleteDatabase);

		const { cleanupOldWebDatabase } = await import('./cleanup.web');

		await cleanupOldWebDatabase('wcposusers_v2');

		expect(deleteDatabase).toHaveBeenCalledWith('wcposusers_v2');
	});

	it('rejects when legacy IndexedDB deletion errors', async () => {
		const deleteDatabase = jest.fn(() => {
			const request: {
				onsuccess?: ((event: Event) => void) | null;
				onerror?: ((event: Event) => void) | null;
				onblocked?: ((event: Event) => void) | null;
			} = {};

			queueMicrotask(() => {
				request.onerror?.(new Event('error'));
			});

			return request;
		});

		setIndexedDb(deleteDatabase);

		const { cleanupOldWebDatabase } = await import('./cleanup.web');

		await expect(cleanupOldWebDatabase('wcposusers_v2')).rejects.toThrow(
			'Failed to delete database: wcposusers_v2'
		);
		expect(deleteDatabase).toHaveBeenCalledWith('wcposusers_v2');
	});

	it('rejects when legacy IndexedDB deletion is blocked', async () => {
		const deleteDatabase = jest.fn(() => {
			const request: {
				onsuccess?: ((event: Event) => void) | null;
				onerror?: ((event: Event) => void) | null;
				onblocked?: ((event: Event) => void) | null;
			} = {};

			queueMicrotask(() => {
				request.onblocked?.(new Event('blocked'));
			});

			return request;
		});

		setIndexedDb(deleteDatabase);

		const { cleanupOldWebDatabase } = await import('./cleanup.web');

		await expect(cleanupOldWebDatabase('wcposusers_v2')).rejects.toThrow(
			'IndexedDB deletion was blocked for database: wcposusers_v2'
		);
		expect(deleteDatabase).toHaveBeenCalledWith('wcposusers_v2');
	});
});
