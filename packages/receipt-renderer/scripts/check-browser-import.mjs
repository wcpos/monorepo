import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { JSDOM } from 'jsdom';
import { build } from 'vite';

const tempDir = await mkdtemp(join(tmpdir(), 'wcpos-receipt-renderer-browser-'));

try {
	const entry = join(tempDir, 'entry.js');
	await writeFile(
		entry,
		`import { renderLogiclessTemplate, renderThermalPreview, encodeThermalTemplate } from '${new URL('../dist/index.js', import.meta.url).href}';

const html = renderLogiclessTemplate('<h1>{{store.name}}</h1>', { store: { name: 'Browser Store' } });
if (!html.includes('Browser Store')) throw new Error('logicless render failed');

const thermal = renderThermalPreview('<receipt><text>{{store.name}}</text></receipt>', { store: { name: 'Browser Store' } });
if (!thermal.includes('Browser Store')) throw new Error('thermal preview failed');

const bytes = encodeThermalTemplate('<receipt><text>{{store.name}}</text></receipt>', { store: { name: 'Browser Store' } });
if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error('thermal encode failed');
`
	);

	await build({
		logLevel: 'silent',
		build: {
			outDir: join(tempDir, 'dist'),
			emptyOutDir: true,
			lib: {
				entry,
				formats: ['es'],
				fileName: () => 'bundle.js',
			},
			rollupOptions: {
				external: [
					'expo-print',
					'react-native-tcp-socket',
					'react-native-esc-pos-printer',
					'react-native-star-io10',
				],
			},
		},
	});

	const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test' });
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.DOMParser = dom.window.DOMParser;
	globalThis.Node = dom.window.Node;
	globalThis.ImageData = dom.window.ImageData ?? class ImageData {};

	const bundle = await import(new URL(`file://${join(tempDir, 'dist/bundle.js')}`).href);
	void bundle;
} finally {
	await rm(tempDir, { recursive: true, force: true });
}
