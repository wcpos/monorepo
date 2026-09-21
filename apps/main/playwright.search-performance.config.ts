import { defineConfig, devices } from '@playwright/test';

import base, { PRO_STORE_URL, type WcposTestOptions } from './playwright.config';

// Run in isolation: parallel functional tests and video encoding perturb frame timing.
// BASE_URL=http://127.0.0.1:8096 pnpm exec playwright test -c playwright.search-performance.config.ts
export default defineConfig<WcposTestOptions>({
	...base,
	testMatch: /search-responsiveness.*\.perf\.spec\.ts$/,
	testIgnore: [],
	fullyParallel: false,
	workers: 1,
	retries: 0,
	use: { ...base.use, video: 'off', trace: 'off' },
	projects: [
		{
			name: 'search-performance',
			use: { ...devices['Desktop Chrome'], storeVariant: 'pro', storeUrl: PRO_STORE_URL },
		},
	],
});
