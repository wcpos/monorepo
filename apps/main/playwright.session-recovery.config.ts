import { defineConfig, devices } from '@playwright/test';

import type { WcposTestOptions } from './playwright.config';

const baseURL = process.env.BASE_URL;
if (!baseURL) {
	throw new Error('BASE_URL is required (a served production web-build)');
}

/**
 * Standalone config for the #2112 incomplete-session live proof — a
 * self-authenticating single spec, run by hand against a lane-matching dev
 * store (see session-recovery.live.spec.ts).
 */
export default defineConfig<WcposTestOptions>({
	testDir: './e2e',
	testMatch: /session-recovery\.live\.spec\.ts/,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 600_000,
	reporter: [['list']],
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'off',
	},
	projects: [
		{
			name: 'session-recovery',
			use: {
				...devices['Desktop Chrome'],
				storeVariant: 'pro',
				storeUrl: process.env.E2E_STORE_URL_PRO || 'https://dev-pro.wcpos.com',
			},
		},
	],
});
