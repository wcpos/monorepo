import { defineConfig, devices } from '@playwright/test';

import type { WcposTestOptions } from './playwright.config';

const baseURL = process.env.BASE_URL;
if (!baseURL) {
	throw new Error('BASE_URL is required (serve web-build first)');
}

/**
 * Standalone config for the hand-run live soaks — same pattern as
 * playwright.verify1135.config.ts: self-authenticating specs, no shared
 * globalSetup, one project per soak so `--project=<name>` runs exactly one.
 */
// Any main-lane store works — the soaks assert wire shapes and renderer
// growth, never contents. SOAK_STORE_URL/SOAK_STORE_VARIANT pick the healthy one.
const soakStore = {
	...devices['Desktop Chrome'],
	storeVariant: (process.env.SOAK_STORE_VARIANT === 'free' ? 'free' : 'pro') as 'free' | 'pro',
	storeUrl:
		process.env.SOAK_STORE_URL || process.env.E2E_STORE_URL_PRO || 'https://dev-pro.wcpos.com',
};

export default defineConfig<WcposTestOptions>({
	testDir: './e2e',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 1_000_000,
	reporter: [['list']],
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'off',
	},
	projects: [
		{
			name: 'idle-soak',
			testMatch: /idle-backfill\.live\.spec\.ts/,
			use: soakStore,
		},
		{
			name: 'tick-403-soak',
			testMatch: /tick-403-soak\.live\.spec\.ts/,
			use: soakStore,
		},
	],
});
