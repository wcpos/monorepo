import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for WCPOS E2E tests
 *
 * Run tests against:
 * - Local dev server: npx playwright test
 * - Preview deployment: BASE_URL=https://preview-xxx.expo.app npx playwright test
 * - Production: BASE_URL=https://wcpos.expo.app npx playwright test
 */
export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: process.env.CI
		? [['github'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results.json' }]]
		: 'html',
	timeout: 180_000,

	use: {
		baseURL: process.env.BASE_URL || 'http://localhost:8081',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],

	/* Run local dev server before tests (only when not testing against deployed URL) */
	webServer: process.env.BASE_URL
		? undefined
		: {
				command: 'pnpm expo start --web --port 8081',
				url: 'http://localhost:8081',
				reuseExistingServer: !process.env.CI,
				timeout: 120 * 1000,
			},
});
