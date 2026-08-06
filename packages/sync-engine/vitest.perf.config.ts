import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * The performance-contract lane (#949), deliberately SEPARATE from vitest.config.ts.
 *
 * These tests hold 10k-50k live documents at a time. Run inside the normal suite they
 * share vitest's worker pool with ~76 functional files, and on a 2-core CI runner that
 * contention pushed two unrelated engine-lifecycle tests past their 5s default timeout
 * (see CI run 31056121028) — a perf suite that destabilises the unit lane is worse than
 * no perf suite. Running alone, single-worker, also makes the timings meaningful:
 * a measurement taken while 76 other files compete for the same cores is noise.
 */
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
		include: ['src/performance-contracts.test.ts'],
		// One file, one worker, no neighbours competing for CPU.
		fileParallelism: false,
		maxWorkers: 1,
		minWorkers: 1,
	},
});
