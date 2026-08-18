jest.mock('@playwright/test', () => ({
	defineConfig: <T>(config: T) => config,
	devices: { 'Desktop Chrome': {} },
}));

describe('Playwright project boundaries', () => {
	const originalFreeStoreUrl = process.env.E2E_STORE_URL_FREE;
	const originalProStoreUrl = process.env.E2E_STORE_URL_PRO;
	const originalCi = process.env.CI;
	const originalGenericStoreUrl = process.env.E2E_STORE_URL;
	const originalBaseUrl = process.env.BASE_URL;

	afterEach(() => {
		if (originalFreeStoreUrl === undefined) {
			delete process.env.E2E_STORE_URL_FREE;
		} else {
			process.env.E2E_STORE_URL_FREE = originalFreeStoreUrl;
		}
		if (originalProStoreUrl === undefined) {
			delete process.env.E2E_STORE_URL_PRO;
		} else {
			process.env.E2E_STORE_URL_PRO = originalProStoreUrl;
		}
		if (originalCi === undefined) {
			delete process.env.CI;
		} else {
			process.env.CI = originalCi;
		}
		if (originalGenericStoreUrl === undefined) {
			delete process.env.E2E_STORE_URL;
		} else {
			process.env.E2E_STORE_URL = originalGenericStoreUrl;
		}
		if (originalBaseUrl === undefined) {
			delete process.env.BASE_URL;
		} else {
			process.env.BASE_URL = originalBaseUrl;
		}
		jest.resetModules();
	});

	it('keeps manual live specs out of both authenticated projects', () => {
		process.env.E2E_STORE_URL_FREE = 'https://free.example.com';
		jest.resetModules();

		const config = require('../playwright.config').default as {
			projects?: { name?: string; testIgnore?: RegExp | RegExp[] }[];
		};

		for (const name of ['free-authenticated', 'pro-authenticated']) {
			const project = config.projects?.find((candidate) => candidate.name === name);
			const ignored = Array.isArray(project?.testIgnore)
				? project.testIgnore
				: [project?.testIgnore];

			expect(project).toBeDefined();
			expect(
				ignored.some(
					(pattern) => pattern instanceof RegExp && pattern.test('manual-proof.live.spec.ts')
				)
			).toBe(true);
		}
	});

	// The main lane spent weeks gated against dev-next because E2E_STORE_URL_PRO
	// was unset and the config quietly filled in the next-train store. A wrong
	// store answers every request happily, so nothing failed until specs started
	// looking flaky. A CI run that never named its stores must stop instead.
	it('refuses to guess a store for a CI lane that never named one', () => {
		process.env.CI = 'true';
		delete process.env.E2E_STORE_URL_FREE;
		delete process.env.E2E_STORE_URL_PRO;
		jest.resetModules();

		expect(() =>
			(
				require('../playwright.config') as {
					assertLaneStoresConfigured(needed: Iterable<string>): void;
				}
			).assertLaneStoresConfigured(['free', 'pro'])
		).toThrow('E2E_STORE_URL_FREE, E2E_STORE_URL_PRO');
	});

	// The nightly cold-start workflow selects `pro-cold-start` alone. Demanding a
	// free store it will never open would fail a run that is correctly configured.
	it('demands only the stores the selected projects will use', () => {
		process.env.CI = 'true';
		delete process.env.E2E_STORE_URL_FREE;
		process.env.E2E_STORE_URL_PRO = 'https://dev-next.wcpos.com';
		jest.resetModules();

		const mod = require('../playwright.config') as {
			assertLaneStoresConfigured(needed: Iterable<string>): void;
			variantsForProjects(names: readonly string[]): Set<string>;
		};
		expect([...mod.variantsForProjects(['pro-cold-start'])]).toEqual(['pro']);
		expect(() =>
			mod.assertLaneStoresConfigured(mod.variantsForProjects(['pro-cold-start']))
		).not.toThrow();
		expect(() => mod.assertLaneStoresConfigured(['free'])).toThrow('E2E_STORE_URL_FREE');
	});

	// A pro-only local run must not drag the free store's OAuth + catalogue sync
	// in behind it; an unavailable free store would fail a run that never uses it.
	it('maps project names to just the variants they need', () => {
		process.env.E2E_STORE_URL_FREE = 'https://dev-free.wcpos.com';
		process.env.E2E_STORE_URL_PRO = 'https://dev-pro.wcpos.com';
		jest.resetModules();

		const { variantsForProjects } = require('../playwright.config') as {
			variantsForProjects(names: readonly string[]): Set<string>;
		};
		expect([...variantsForProjects(['pro-authenticated'])]).toEqual(['pro']);
		expect([...variantsForProjects(['free-authenticated'])]).toEqual(['free']);
		expect([...variantsForProjects(['free-authenticated', 'pro-authenticated'])].sort()).toEqual([
			'free',
			'pro',
		]);
		// A bare `playwright test` selects everything, so it needs everything.
		expect([...variantsForProjects([])].sort()).toEqual(['free', 'pro']);
	});

	// E2E_STORE_URL points both variants at one store (e2e-native.yml). Resolving
	// it here AND again in getStoreUrl let setup stub one origin and connect to another.
	it('folds the generic store override into both variants', () => {
		process.env.CI = 'true';
		delete process.env.E2E_STORE_URL_FREE;
		delete process.env.E2E_STORE_URL_PRO;
		process.env.E2E_STORE_URL = 'https://dev-pro.wcpos.com';
		jest.resetModules();

		const mod = require('../playwright.config') as {
			assertLaneStoresConfigured(needed: Iterable<string>): void;
			FREE_STORE_URL: string;
			PRO_STORE_URL: string;
		};
		expect(mod.PRO_STORE_URL).toBe('https://dev-pro.wcpos.com');
		expect(mod.FREE_STORE_URL).toBe('https://dev-pro.wcpos.com');
		expect(() => mod.assertLaneStoresConfigured(['free', 'pro'])).not.toThrow();
		delete process.env.E2E_STORE_URL;
	});

	// The same import happens in unit tests and the one-off sibling configs, none
	// of which touch a store; the guard belongs at globalSetup, not module load.
	it('still imports cleanly under CI without store env', () => {
		process.env.CI = 'true';
		delete process.env.E2E_STORE_URL_FREE;
		delete process.env.E2E_STORE_URL_PRO;
		jest.resetModules();

		expect(() => require('../playwright.config')).not.toThrow();
	});

	it('accepts a lane that named both stores', () => {
		process.env.CI = 'true';
		process.env.E2E_STORE_URL_FREE = 'https://dev-free.wcpos.com';
		process.env.E2E_STORE_URL_PRO = 'https://dev-pro.wcpos.com';
		jest.resetModules();

		const mod = require('../playwright.config') as {
			assertLaneStoresConfigured(): void;
			FREE_STORE_URL: string;
			PRO_STORE_URL: string;
		};
		expect(() => mod.assertLaneStoresConfigured()).not.toThrow();
		expect(mod.FREE_STORE_URL).toBe('https://dev-free.wcpos.com');
		expect(mod.PRO_STORE_URL).toBe('https://dev-pro.wcpos.com');
	});

	it('requires the current deployment URL for the pro#425 live proof', () => {
		delete process.env.BASE_URL;
		jest.resetModules();

		expect(() => require('../playwright.pro425.config')).toThrow(
			'BASE_URL is required and must identify the current client deployment'
		);

		process.env.BASE_URL = 'https://current-preview.example.com';
		jest.resetModules();

		const config = require('../playwright.pro425.config').default as {
			use?: { baseURL?: string };
		};
		expect(config.use?.baseURL).toBe('https://current-preview.example.com');
	});
});
