import { defineConfig, devices } from '@playwright/test';

import type { WcposTestOptions } from './playwright.config';

const baseURL = process.env.BASE_URL;
if (!baseURL) {
	throw new Error('BASE_URL is required (deployed pre-fix client, or the local fixed build)');
}

/**
 * Standalone config for the #1284 ghost-resident live proof — self-authenticating
 * single spec, run by hand in two phases (see ghost-prune.live.spec.ts).
 */
export default defineConfig<WcposTestOptions>({
	testDir: './e2e',
	testMatch: /ghost-prune\.live\.spec\.ts/,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 900_000,
	reporter: [['list']],
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'off',
	},
	projects: [
		{
			name: 'ghostprune',
			use: {
				...devices['Desktop Chrome'],
				storeVariant: 'free',
				storeUrl: process.env.E2E_STORE_URL_FREE || 'https://dev-free.wcpos.com',
			},
		},
	],
});
