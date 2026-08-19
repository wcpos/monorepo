import { defineConfig, devices } from '@playwright/test';

import type { WcposTestOptions } from './playwright.config';

const baseURL = process.env.BASE_URL;
if (!baseURL) {
	throw new Error('BASE_URL is required (serve web-build first)');
}

/**
 * Standalone config for the idle-backfill live soak — same pattern as
 * playwright.verify1135.config.ts: self-authenticating single spec, no shared
 * globalSetup, run by hand only.
 */
export default defineConfig<WcposTestOptions>({
	testDir: './e2e',
	testMatch: /idle-backfill\.live\.spec\.ts/,
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
			use: {
				...devices['Desktop Chrome'],
				// Any main-lane store works — the soak asserts wire shapes, never
				// contents. SOAK_STORE_URL/SOAK_STORE_VARIANT pick the healthy one.
				storeVariant: (process.env.SOAK_STORE_VARIANT === 'free' ? 'free' : 'pro') as
					'free' | 'pro',
				storeUrl:
					process.env.SOAK_STORE_URL ||
					process.env.E2E_STORE_URL_PRO ||
					'https://dev-pro.wcpos.com',
			},
		},
	],
});
