import { defineConfig, devices } from '@playwright/test';

/**
 * Custom test options passed to each project.
 */
export type StoreVariant = 'free' | 'pro';

export interface WcposTestOptions {
	storeVariant: StoreVariant;
	storeUrl: string;
}

// dev-next is a PRO store: the free matrix (upgrade-gate expectations) is
// mutually exclusive with it, so the free project only runs when an explicit
// free next-train target is provided.
const FREE_STORE_URL = process.env.E2E_STORE_URL_FREE || '';
const PRO_STORE_URL = process.env.E2E_STORE_URL_PRO || 'https://dev-next.wcpos.com';
const FREE_PROJECT_ENABLED = FREE_STORE_URL.length > 0;

/**
 * Playwright configuration for WCPOS E2E tests
 *
 * Run tests against:
 * - Local dev server: npx playwright test
 * - Preview deployment: BASE_URL=https://preview-xxx.expo.app npx playwright test
 * - Production: BASE_URL=https://wcpos.expo.app npx playwright test
 *
 * Run a single variant:
 * - npx playwright test --project=free-authenticated
 * - npx playwright test --project=pro-authenticated
 */
export default defineConfig<WcposTestOptions>({
	globalSetup: './e2e/global-setup.ts',
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 4 : 1,
	reporter: process.env.CI
		? [
				['github'],
				['list'],
				['html', { open: 'never' }],
				['json', { outputFile: 'test-results.json' }],
				['blob'],
			]
		: 'html',
	timeout: 180_000,

	use: {
		baseURL: process.env.BASE_URL || 'http://localhost:8081',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},

	projects: [
		// Free store — only when an explicit free next-train target exists (see above).
		...(FREE_PROJECT_ENABLED
			? [
					{
						name: 'free-unauthenticated',
						testMatch: /auth\.spec\.ts/,
						use: {
							...devices['Desktop Chrome'],
							storeVariant: 'free' as const,
							storeUrl: FREE_STORE_URL,
						},
					},
					{
						name: 'free-authenticated',
						testIgnore: /auth\.spec\.ts/,
						use: {
							...devices['Desktop Chrome'],
							storeVariant: 'free' as const,
							storeUrl: FREE_STORE_URL,
						},
					},
				]
			: []),
		// Pro store
		{
			name: 'pro-unauthenticated',
			testMatch: /auth\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				storeVariant: 'pro',
				storeUrl: PRO_STORE_URL,
			},
		},
		{
			name: 'pro-authenticated',
			testIgnore: /auth\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				storeVariant: 'pro',
				storeUrl: PRO_STORE_URL,
			},
		},
	],

	/* Build and serve web app locally before tests (only when not testing against deployed URL) */
	webServer: process.env.BASE_URL
		? undefined
		: {
				command: 'pnpm run build:web && npx serve web-build -p 8081 -s',
				url: 'http://localhost:8081',
				reuseExistingServer: !process.env.CI,
				timeout: 180 * 1000,
			},
});
