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
// The variant must match the store, or the version stub advertises the wrong
// plugin to the client: when SOAK_STORE_VARIANT is not given it follows the
// dev-store naming (`dev-free.*` is the free plugin, anything else is pro).
const soakStoreUrl =
	process.env.SOAK_STORE_URL || process.env.E2E_STORE_URL_PRO || 'https://dev-pro.wcpos.com';
const soakStoreVariant: 'free' | 'pro' =
	process.env.SOAK_STORE_VARIANT === 'free' || process.env.SOAK_STORE_VARIANT === 'pro'
		? process.env.SOAK_STORE_VARIANT
		: new URL(soakStoreUrl).hostname.startsWith('dev-free')
			? 'free'
			: 'pro';
const soakStore = {
	...devices['Desktop Chrome'],
	storeVariant: soakStoreVariant,
	storeUrl: soakStoreUrl,
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
