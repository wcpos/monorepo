import type { CreateAppSyncEngineOptions } from './create-app-engine';

const BASE_OPTIONS = {
	wpApiUrl: 'https://store.example.test/wp-json/',
	credentials: { getLatest: () => ({ access_token: 'test-token' }) },
	scope: {
		site: 'https://store.example.test',
		storeId: 'store-1',
		cashierId: 'cashier-1',
	},
	multiInstance: false,
} satisfies CreateAppSyncEngineOptions;

function createEngineDouble() {
	return {
		dispose: jest.fn().mockResolvedValue(undefined),
	};
}

function loadCreateAppEngine() {
	jest.resetModules();
	const createRxdbSyncEngine = jest.fn(() => createEngineDouble());

	jest.doMock('@wcpos/sync-engine', () => ({ createRxdbSyncEngine }));
	jest.doMock('@wcpos/database/adapters/default', () => ({
		defaultConfig: { storage: { name: 'test-storage' } },
	}));

	const { createAppSyncEngine } =
		jest.requireActual<typeof import('./create-app-engine')>('./create-app-engine');
	return { createAppSyncEngine, createRxdbSyncEngine };
}

describe('createAppSyncEngine scope cache', () => {
	it('returns the identical engine when the same scope is constructed twice', () => {
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();

		const first = createAppSyncEngine(BASE_OPTIONS);
		const second = createAppSyncEngine({
			...BASE_OPTIONS,
			scope: { ...BASE_OPTIONS.scope },
		});

		expect(second).toBe(first);
		expect(createRxdbSyncEngine).toHaveBeenCalledTimes(1);
	});

	it('constructs a new engine and disposes the previous engine when the scope changes', () => {
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		const first = createAppSyncEngine(BASE_OPTIONS);

		const second = createAppSyncEngine({
			...BASE_OPTIONS,
			scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' },
		});

		expect(second).not.toBe(first);
		expect(createRxdbSyncEngine).toHaveBeenCalledTimes(2);
		expect(first.dispose).toHaveBeenCalledTimes(1);
	});

	it.each([
		['storeId', { ...BASE_OPTIONS, scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' } }],
		['cashierId', { ...BASE_OPTIONS, scope: { ...BASE_OPTIONS.scope, cashierId: 'cashier-2' } }],
		['wpApiUrl', { ...BASE_OPTIONS, wpApiUrl: 'https://other.example.test/wp-json/' }],
		['multiInstance', { ...BASE_OPTIONS, multiInstance: true }],
	] satisfies readonly (readonly [string, CreateAppSyncEngineOptions])[])(
		'treats %s as part of the scope key',
		(_field, changedOptions) => {
			const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
			const first = createAppSyncEngine(BASE_OPTIONS);

			const second = createAppSyncEngine(changedOptions);

			expect(second).not.toBe(first);
			expect(createRxdbSyncEngine).toHaveBeenCalledTimes(2);
			expect(first.dispose).toHaveBeenCalledTimes(1);
		}
	);
});
