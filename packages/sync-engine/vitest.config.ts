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
	},
});
