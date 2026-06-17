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
			// The @point-of-sale/webbluetooth-receipt-printer package only exports under
			// the `browser` condition. Map it to the ESM bundle for vitest (node env).
			'@point-of-sale/webbluetooth-receipt-printer': resolve(
				__dirname,
				'../../node_modules/@point-of-sale/webbluetooth-receipt-printer/dist/webbluetooth-receipt-printer.esm.js'
			),
		},
	},
	test: {
		globals: true,
		environment: 'jsdom',
	},
});
