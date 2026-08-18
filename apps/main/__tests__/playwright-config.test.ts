jest.mock('@playwright/test', () => ({
	defineConfig: <T>(config: T) => config,
	devices: { 'Desktop Chrome': {} },
}));

describe('Playwright project boundaries', () => {
	const originalFreeStoreUrl = process.env.E2E_STORE_URL_FREE;
	const originalProStoreUrl = process.env.E2E_STORE_URL_PRO;
	const originalCi = process.env.CI;
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
				require('../playwright.config') as { assertLaneStoresConfigured(): void }
			).assertLaneStoresConfigured()
		).toThrow('E2E_STORE_URL_FREE, E2E_STORE_URL_PRO');
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
