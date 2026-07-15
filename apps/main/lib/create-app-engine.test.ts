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

function createEngineDouble(dispose: () => Promise<void> = () => Promise.resolve()) {
	return {
		dispose: jest.fn(dispose),
	};
}

function loadCreateAppEngine(
	createEngine: () => ReturnType<typeof createEngineDouble> = createEngineDouble
) {
	jest.resetModules();
	const createRxdbSyncEngine = jest.fn(
		(
			_ports: {
				fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
				databaseOpenBarrier?: Promise<void>;
			},
			_scope: unknown
		) => createEngine()
	);

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

	it.each([
		['storeId', { ...BASE_OPTIONS, scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' } }],
		['cashierId', { ...BASE_OPTIONS, scope: { ...BASE_OPTIONS.scope, cashierId: 'cashier-2' } }],
		[
			'site',
			{
				...BASE_OPTIONS,
				wpApiUrl: 'https://other.example.test/wp-json/',
				scope: { ...BASE_OPTIONS.scope, site: 'https://other.example.test' },
			},
		],
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

	it('treats multi-instance and trailing-slash changes on the same scope as a cache hit', () => {
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		const first = createAppSyncEngine(BASE_OPTIONS);

		const second = createAppSyncEngine({
			...BASE_OPTIONS,
			wpApiUrl: 'https://store.example.test/wp-json',
			scope: { ...BASE_OPTIONS.scope, site: 'HTTP://STORE.EXAMPLE.TEST/' },
			multiInstance: true,
		});

		expect(second).toBe(first);
		expect(createRxdbSyncEngine).toHaveBeenCalledTimes(1);
		expect(first.dispose).not.toHaveBeenCalled();
	});

	it('uses the latest credentials and JWT mode after a same-scope cache hit', async () => {
		const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine();
		createAppSyncEngine(BASE_OPTIONS);
		const latestCredentials = {
			getLatest: jest.fn(() => ({ access_token: 'latest-token' })),
		};

		createAppSyncEngine({
			...BASE_OPTIONS,
			credentials: latestCredentials,
			useJwtAsParam: true,
		});
		const fetcher = createRxdbSyncEngine.mock.calls[0]?.[0].fetcher;
		await fetcher?.('https://store.example.test/wp-json/wcpos/v1/sync/products');

		expect(latestCredentials.getLatest).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledWith(
			'https://store.example.test/wp-json/wcpos/v1/sync/products?authorization=Bearer+latest-token',
			expect.objectContaining({ headers: expect.objectContaining({}) })
		);
		const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		const headers = init.headers as Headers;
		expect(headers.get('Authorization')).toBeNull();
		expect(headers.get('X-WCPOS')).toBe('1');
		fetch.mockRestore();
	});

	it('waits for an earlier disposal before reopening the same physical database', async () => {
		let resolveFirstDisposal: () => void = () => undefined;
		const firstDisposal = new Promise<void>((resolve) => {
			resolveFirstDisposal = resolve;
		});
		const engines = [
			createEngineDouble(() => firstDisposal),
			createEngineDouble(),
			createEngineDouble(),
		];
		const { createAppSyncEngine, createRxdbSyncEngine } = loadCreateAppEngine(() => {
			const engine = engines.shift();
			if (!engine) throw new Error('missing engine double');
			return engine;
		});
		const first = createAppSyncEngine(BASE_OPTIONS);

		createAppSyncEngine({
			...BASE_OPTIONS,
			scope: { ...BASE_OPTIONS.scope, storeId: 'store-2' },
		});
		createAppSyncEngine(BASE_OPTIONS);
		const databaseOpenBarrier = createRxdbSyncEngine.mock.calls[2]?.[0].databaseOpenBarrier;
		let barrierSettled = false;
		const open = databaseOpenBarrier?.then(() => {
			barrierSettled = true;
		});

		expect(first.dispose).toHaveBeenCalledTimes(1);
		expect(createRxdbSyncEngine).toHaveBeenCalledTimes(3);
		await Promise.resolve();
		expect(barrierSettled).toBe(false);

		resolveFirstDisposal();
		await open;

		expect(barrierSettled).toBe(true);
	});
});
