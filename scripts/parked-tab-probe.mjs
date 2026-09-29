// Provider-free REAL ParkedTab, using the installed Uniwind web compiler and RNW bindings.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { build } from 'esbuild';
import { transform } from 'lightningcss';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const ignored = (() => {
	try {
		execFileSync('git', ['check-ignore', '-q', '.scratch/parked-tab/probe.html']);
		return true;
	} catch {
		return false;
	}
})();
const output = resolve(ignored ? '.scratch/parked-tab' : '/tmp/claude-501/parked-tab');
await mkdir(output, { recursive: true });
// Same compile/scan/cssVisitor pipeline as uniwind/dist/metro/transformer.mjs.
// Artifacts go beside the screenshots, never into the app or installed package.
const metroEntry = require.resolve('uniwind/metro').replace(/\.cjs$/, '.mjs');
const sharedPath = (await readFile(metroEntry, 'utf8')).match(
	/from ['"](\.\.\/shared\/[^'"]+)['"]/
)[1];
const { U: UniwindBundlerConfig } = await import(resolve(dirname(metroEntry), sharedPath));
const config = UniwindBundlerConfig.fromMetroConfig(
	{
		cssEntryFile: 'apps/main/global.css',
		extraThemes: ['ocean', 'sunset', 'monochrome'],
		dtsFile: resolve(output, 'uniwind-types.d.ts'),
	},
	'web'
);
const artifact = resolve(output, 'uniwind.css');
await config.generateArtifacts(artifact);
const css = (await readFile(config.cssPath, 'utf8')).replace(
	"@import 'uniwind';",
	`@import '${artifact}';`
);
const compiler = await compile(css, { base: dirname(config.cssPath), onDependency() {} });
const scanner = new Scanner({
	sources: [
		...compiler.sources,
		{ base: dirname(config.cssPath), pattern: '**/*', negated: false },
	],
});
const compiled = transform({
	code: Buffer.from(compiler.build(scanner.scan())),
	filename: 'global.css',
	visitor: config.cssVisitor,
}).code;
await writeFile(resolve(output, 'global.css'), compiled);

const bundle = await build({
	stdin: {
		resolveDir: process.cwd(),
		loader: 'tsx',
		contents: `
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { ParkedTab } from './apps/main/components/parked-tab';
const root = createRoot(document.getElementById('root'));
globalThis.showState = state => root.render(<ParkedTab state={state} takeOver={() => {}} />);
`,
	},
	conditions: ['browser', 'expo-source'],
	loader: { '.mjs': 'jsx' },
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'browser',
	define: {
		global: 'globalThis',
		__DEV__: 'false',
		'process.env.NODE_ENV': '"production"',
		'process.env': '{}',
	},
	resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
	alias: {
		'@react-native/assets-registry/registry':
			require.resolve('react-native-web/dist/modules/AssetRegistry'),
		'@wcpos/components': resolve('packages/components/src'),
		'@wcpos/core': resolve('packages/core/src'),
		'@wcpos/utils': resolve('packages/utils/src'),
	},
	plugins: [
		{
			name: 'uniwind-rnw',
			setup(builder) {
				builder.onResolve({ filter: /^react-native$/ }, (args) => ({
					path: args.importer.includes('/node_modules/')
						? require.resolve('react-native-web')
						: resolve('node_modules/uniwind/dist/module/components/web/index.js'),
				}));
				builder.onResolve({ filter: /^\.\/createOrderedCSSStyleSheet$/ }, (args) =>
					args.importer.includes('react-native-web')
						? {
								path: resolve(
									resolve('node_modules/uniwind/dist/module/components/web'),
									'createOrderedCSSStyleSheet.js'
								),
							}
						: undefined
				);
			},
		},
	],
});
await writeFile(resolve(output, 'probe.js'), bundle.outputFiles[0].contents);
const html =
	'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/global.css"><style>html,body,#root{margin:0;width:100%;height:100%}#root{display:flex}</style><div id="root"></div><script type="module" src="/probe.js"></script>';
await writeFile(resolve(output, 'probe.html'), html);
const server = createServer(async (req, res) => {
	const file = { '/': 'probe.html', '/probe.js': 'probe.js', '/global.css': 'global.css' }[req.url];
	if (!file) return res.writeHead(404).end();
	res.setHeader(
		'Content-Type',
		file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'
	);
	res.end(await readFile(resolve(output, file)));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
const states = {
	parked: { kind: 'parked', reason: 'another-tab-live' },
	waiting: { kind: 'taking-over', deferral: null },
	payment: { kind: 'taking-over', deferral: 'payment' },
	write: { kind: 'taking-over', deferral: 'write' },
	'no-answer': { kind: 'taking-over', deferral: 'no-answer' },
	lost: { kind: 'parked', reason: 'worker-lost' },
};
try {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => {
		errors.push(error.message);
		console.error(error.stack);
	});
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	await page.waitForFunction(() => typeof globalThis.showState === 'function', null, {
		timeout: 5000,
	});
	const measurements = [];
	for (const [device, viewport] of Object.entries({
		tablet: { width: 1024, height: 768 },
		phone: { width: 390, height: 844 },
	})) {
		await page.setViewportSize(viewport);
		for (const colorScheme of ['light', 'dark']) {
			await page.emulateMedia({ colorScheme });
			for (const [name, state] of Object.entries(states)) {
				await page.evaluate((state) => globalThis.showState(state), state);
				const screen = page.getByTestId('parked-tab');
				await screen.waitFor();
				await page.waitForFunction(
					(expected) =>
						document.querySelector('[data-testid="parked-tab"]')?.dataset.state === expected,
					state.kind === 'parked'
						? `parked:${state.reason}`
						: `taking-over:${state.deferral ?? 'waiting'}`
				);
				const button = page.getByTestId(
					name === 'lost' ? 'parked-tab-reload' : 'parked-tab-take-over'
				);
				const box = await button.boundingBox();
				assert(box.height >= 44, `${device}/${colorScheme}/${name}: button height ${box.height}`);
				const title = await page
					.getByTestId('parked-tab-content-title')
					.evaluate((el) => getComputedStyle(el).color);
				const background = await screen.evaluate((el) => getComputedStyle(el).backgroundColor);
				assert.notEqual(background, 'rgba(0, 0, 0, 0)', 'background token must resolve');
				assert.notEqual(title, background, 'title must contrast with background');
				const contrast = await page.evaluate(
					([foreground, background]) => {
						const context = document.createElement('canvas').getContext('2d');
						const luminance = (color) => {
							context.fillStyle = color;
							context.fillRect(0, 0, 1, 1);
							const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
								const channel = value / 255;
								return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
							});
							return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
						};
						const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
						return (values[1] + 0.05) / (values[0] + 0.05);
					},
					[title, background]
				);
				assert(contrast >= 4.5, `title contrast ${contrast}`);
				assert.equal(await button.isDisabled(), state.kind === 'taking-over');
				const path = resolve(output, `${device}-${colorScheme}-${name}.png`);
				await page.screenshot({ path });
				measurements.push({
					device,
					colorScheme,
					state: name,
					height: box.height,
					contrast,
					title,
					background,
					path,
				});
				console.log(`PASS ${path}`);
			}
		}
	}
	assert.deepEqual(errors, []);
	await writeFile(resolve(output, 'measurements.json'), JSON.stringify(measurements, null, 2));
} finally {
	await browser.close();
	await new Promise((resolve) => server.close(resolve));
}
