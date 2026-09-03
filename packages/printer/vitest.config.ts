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
			'@point-of-sale/webusb-receipt-printer': resolve(
				__dirname,
				'../../node_modules/@point-of-sale/webusb-receipt-printer/dist/webusb-receipt-printer.esm.js'
			),
		},
	},
	// The ipc-channels registry is a .cts file (CJS for the Electron preload build);
	// the default TS transform misses the .cts extension, so tag it explicitly.
	plugins: [
		{
			name: 'treat-cts-as-ts',
			async transform(code, id) {
				if (/\.cts(\?.*)?$/.test(id)) {
					const { transformWithOxc } = await import('vite');
					return transformWithOxc(code, id.replace(/\.cts(\?.*)?$/, '.ts'));
				}
			},
		},
	],
	test: {
		globals: true,
		environment: 'jsdom',
	},
});
