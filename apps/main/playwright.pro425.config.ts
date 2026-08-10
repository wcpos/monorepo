import { defineConfig, devices } from '@playwright/test';

import type { WcposTestOptions } from './playwright.config';

/**
 * Standalone config for the pro#425 live proof.
 *
 * Deliberately separate from playwright.config.ts: that one runs a globalSetup
 * which authenticates BOTH store variants as an e2e-cashier and exports OPFS
 * state. This spec authenticates itself, as a manager, against one store — so
 * the shared setup is several minutes of work whose result it would discard.
 */
export default defineConfig<WcposTestOptions>({
	testDir: './e2e',
	testMatch: /pro425-store-pricing\.live\.spec\.ts/,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 300_000,
	reporter: [['list']],
	use: {
		baseURL: process.env.BASE_URL || 'https://wcpos--zcc33oemdf.expo.app',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'off',
	},
	projects: [
		{
			name: 'pro425',
			use: {
				...devices['Desktop Chrome'],
				storeVariant: 'pro',
				storeUrl: process.env.E2E_STORE_URL_PRO || 'https://dev-next.wcpos.com',
			},
		},
	],
});
