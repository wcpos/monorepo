import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@wcpos/receipt-renderer/render-template': resolve(
				__dirname,
				'../receipt-renderer/src/render-template.ts'
			),
			'@wcpos/receipt-renderer': resolve(__dirname, '../receipt-renderer/src/index.ts'),
		},
	},
	test: {
		globals: true,
		environment: 'jsdom',
	},
});
