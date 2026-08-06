import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
	define: { __DEV__: 'true' },
	resolve: {
		alias: [
			{
				find: '@wcpos/sync-core/testing',
				replacement: fileURLToPath(new URL('../sync-core/src/testing.ts', import.meta.url)),
			},
			{
				find: '@wcpos/sync-core',
				replacement: fileURLToPath(new URL('../sync-core/src/index.ts', import.meta.url)),
			},
		],
	},
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts'],
		// The performance contracts hold 10k-50k live documents at a time. Sharing a
		// worker pool with the functional suites starved them on 2-core CI runners and
		// tipped two engine-lifecycle tests past their 5s timeout (#949 CI run
		// 31056121028), so the perf lane runs alone via `pnpm test:perf`.
		exclude: ['**/node_modules/**', 'src/performance-contracts.test.ts'],
	},
});
