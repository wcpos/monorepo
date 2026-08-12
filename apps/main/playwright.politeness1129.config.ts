import { defineConfig, devices } from '@playwright/test';

import type { WcposTestOptions } from './playwright.config';

const baseURL = process.env.BASE_URL;
if (!baseURL) {
	throw new Error('BASE_URL is required and must identify the current client deployment');
}

/**
 * Standalone config for the #1129 politeness live proof — separate from
 * playwright.config.ts for the same reason as pro425: the shared globalSetup
 * authenticates both store variants and exports OPFS state, minutes of work
 * this single self-authenticating spec would discard.
 */
export default defineConfig<WcposTestOptions>({
	testDir: './e2e',
	testMatch: /politeness-1129\.live\.spec\.ts/,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 360_000,
	reporter: [['list']],
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'off',
	},
	projects: [
		{
			name: 'politeness1129',
			use: {
				...devices['Desktop Chrome'],
				storeVariant: 'pro',
				storeUrl: process.env.E2E_STORE_URL_PRO || 'https://dev-next.wcpos.com',
			},
		},
	],
});
