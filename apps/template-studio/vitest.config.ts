import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@wcpos/receipt-renderer': fileURLToPath(
				new URL('../../packages/receipt-renderer/src/index.ts', import.meta.url)
			),
		},
	},
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: './src/test/setup.ts',
	},
});
