import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { listBundledTemplates } from './src/template-loader';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const defaultWooCommercePosRoot = repoRoot.includes(`${path.sep}.worktrees${path.sep}`)
	? path.resolve(repoRoot, '../../..', 'woocommerce-pos')
	: path.resolve(repoRoot, '../woocommerce-pos');
const wooCommercePosRoot = process.env.WCPOS_PLUGIN_ROOT ?? defaultWooCommercePosRoot;
const galleryTemplatesDir = path.join(wooCommercePosRoot, 'templates/gallery');
const fixturesDir = path.resolve(fileURLToPath(new URL('./fixtures', import.meta.url)));
const wpProxyTarget = process.env.WCPOS_STUDIO_WP_URL ?? 'http://localhost:8888';

function templateStudioPlugin(): Plugin {
	return {
		name: 'wcpos-template-studio-data',
		configureServer(server) {
			server.watcher.add(galleryTemplatesDir);
			server.watcher.add(fixturesDir);
			server.watcher.on('change', (file) => {
				if (file.startsWith(galleryTemplatesDir) || file.startsWith(fixturesDir)) {
					server.ws.send({ type: 'full-reload' });
				}
			});

			server.middlewares.use('/__studio/templates', async (_request, response) => {
				try {
					const templates = await listBundledTemplates({
						templatesDir: new URL(`file://${galleryTemplatesDir}/`),
					});
					response.setHeader('Content-Type', 'application/json');
					response.end(JSON.stringify(templates));
				} catch (error) {
					response.statusCode = 500;
					response.end(error instanceof Error ? error.message : String(error));
				}
			});

			server.middlewares.use('/__studio/fixtures', async (_request, response) => {
				try {
					const files = (await fs.readdir(fixturesDir))
						.filter((file) => file.endsWith('.json'))
						.sort();
					const fixtures = await Promise.all(
						files.map(async (file) =>
							JSON.parse(await fs.readFile(path.join(fixturesDir, file), 'utf8'))
						)
					);
					response.setHeader('Content-Type', 'application/json');
					response.end(JSON.stringify(fixtures));
				} catch (error) {
					response.statusCode = 500;
					response.end(error instanceof Error ? error.message : String(error));
				}
			});
		},
	};
}

export default defineConfig({
	resolve: {
		alias: {
			'@wcpos/receipt-renderer': fileURLToPath(
				new URL('../../packages/receipt-renderer/src/index.ts', import.meta.url)
			),
		},
	},
	plugins: [react(), templateStudioPlugin()],
	server: {
		fs: { allow: [repoRoot, wooCommercePosRoot] },
		proxy: {
			'/wp-json': {
				target: wpProxyTarget,
				changeOrigin: true,
				secure: false,
				configure(proxy) {
					proxy.on('proxyReq', (proxyReq) => {
						proxyReq.setHeader('X-WCPOS', '1');
					});
				},
			},
		},
	},
});
