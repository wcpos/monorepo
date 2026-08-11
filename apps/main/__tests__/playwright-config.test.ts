jest.mock('@playwright/test', () => ({
	defineConfig: <T>(config: T) => config,
	devices: { 'Desktop Chrome': {} },
}));

describe('Playwright project boundaries', () => {
	const originalFreeStoreUrl = process.env.E2E_STORE_URL_FREE;
	const originalBaseUrl = process.env.BASE_URL;

	afterEach(() => {
		if (originalFreeStoreUrl === undefined) {
			delete process.env.E2E_STORE_URL_FREE;
		} else {
			process.env.E2E_STORE_URL_FREE = originalFreeStoreUrl;
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
