import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import {
	allowedHostsFromEnv,
	allowedOriginsFromEnv,
	isLoopbackAddress,
	isPrintHostAllowed,
	isStoreOriginAllowed,
	shouldForwardCookies,
} from './scripts/studio-security';
import { resolveDefaultWooCommercePosRoot } from './scripts/studio-paths';
import { listBundledTemplates } from './src/template-loader';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const defaultWooCommercePosRoot = resolveDefaultWooCommercePosRoot(repoRoot);
const wooCommercePosRoot = process.env.WCPOS_PLUGIN_ROOT ?? defaultWooCommercePosRoot;
const galleryTemplatesDir = path.join(wooCommercePosRoot, 'templates/gallery');
const wpProxyTarget = process.env.WCPOS_STUDIO_WP_URL ?? 'http://localhost:8888';
const wpProxyOrigin = new URL(wpProxyTarget).origin;
const allowedStoreOrigins = allowedOriginsFromEnv(
	process.env.WCPOS_STUDIO_STORE_ORIGINS,
	wpProxyOrigin
);
const allowedPrintHosts = allowedHostsFromEnv(process.env.WCPOS_STUDIO_PRINT_HOSTS);
const upstreamFetchTimeoutMs = 10_000;

function templateStudioPlugin(): Plugin {
	return {
		name: 'wcpos-template-studio-data',
		configureServer(server) {
			server.watcher.add(galleryTemplatesDir);
			server.watcher.on('change', (file) => {
				if (file.startsWith(galleryTemplatesDir)) {
					server.ws.send({ type: 'full-reload' });
				}
			});

			server.middlewares.use('/__studio/templates', async (_request, response) => {
				try {
					const templates = await listBundledTemplates({
						templatesDir: pathToFileURL(galleryTemplatesDir),
					});
					response.setHeader('Content-Type', 'application/json');
					response.end(JSON.stringify(templates));
				} catch (error) {
					response.statusCode = 500;
					response.end(error instanceof Error ? error.message : String(error));
				}
			});

			server.middlewares.use('/__studio/wp-preview', async (request, response) => {
				try {
					const requestUrl = new URL(request.url ?? '', 'http://template-studio.local');
					const storeUrl = requestUrl.searchParams.get('store_url') ?? wpProxyTarget;
					const templateId = requestUrl.searchParams.get('template_id');
					const orderId = requestUrl.searchParams.get('order_id');

					if (!templateId) {
						response.statusCode = 400;
						response.end('Missing template_id');
						return;
					}

					if (!isStoreOriginAllowed(storeUrl, allowedStoreOrigins)) {
						response.statusCode = 403;
						response.end(
							`Store URL is not allowed. Set WCPOS_STUDIO_STORE_ORIGINS to include the origin for ${storeUrl}.`
						);
						return;
					}

					const target = new URL(
						`/wp-json/wcpos/v1/templates/${encodeURIComponent(templateId)}/preview`,
						storeUrl
					);
					target.searchParams.set('include_legacy_html', '1');
					if (orderId) target.searchParams.set('order_id', orderId);

					const controller = new AbortController();
					const timeout = setTimeout(() => controller.abort(), upstreamFetchTimeoutMs);
					let upstream: Response;
					try {
						upstream = await fetch(target, {
							signal: controller.signal,
							headers: {
								'X-WCPOS': '1',
								...(shouldForwardCookies(storeUrl, wpProxyOrigin)
									? { cookie: request.headers.cookie ?? '' }
									: {}),
							},
						});
					} finally {
						clearTimeout(timeout);
					}

					response.statusCode = upstream.status;
					response.setHeader(
						'Content-Type',
						upstream.headers.get('content-type') ?? 'application/json'
					);
					response.end(await upstream.text());
				} catch (error) {
					response.statusCode = isAbortError(error) ? 504 : 500;
					response.end(error instanceof Error ? error.message : String(error));
				}
			});

			server.middlewares.use('/__studio/print/raw-tcp', async (request, response) => {
				if (request.method !== 'POST') {
					response.statusCode = 405;
					response.end('Method Not Allowed');
					return;
				}

				if (!isLoopbackAddress(request.socket.remoteAddress)) {
					response.statusCode = 403;
					response.end('Raw TCP printing is only available from loopback clients');
					return;
				}

				if (request.headers['x-wcpos-template-studio'] !== '1') {
					response.statusCode = 403;
					response.end('Raw TCP printing requires the Template Studio request header');
					return;
				}

				try {
					const body = await readJsonBody(request);
					const host = typeof body.host === 'string' ? body.host.trim() : '';
					const port = Number(body.port);
					const data = typeof body.data === 'string' ? body.data : '';

					if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !data) {
						response.statusCode = 400;
						response.end('Expected host, port, and base64 data');
						return;
					}

					if (!isPrintHostAllowed(host, allowedPrintHosts)) {
						response.statusCode = 403;
						response.end(
							`Raw TCP host is not allowed. Set WCPOS_STUDIO_PRINT_HOSTS to include ${host}.`
						);
						return;
					}

					const bytesWritten = await sendRawTcp(host, port, Buffer.from(data, 'base64'));
					response.setHeader('Content-Type', 'application/json');
					response.end(JSON.stringify({ ok: true, bytesWritten }));
				} catch (error) {
					response.statusCode = error instanceof SyntaxError ? 400 : 500;
					response.end(error instanceof Error ? error.message : String(error));
				}
			});
		},
	};
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}

function readJsonBody(
	request: import('node:http').IncomingMessage
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		let raw = '';
		request.setEncoding('utf8');
		request.on('data', (chunk) => {
			raw += chunk;
		});
		request.on('end', () => {
			try {
				resolve(JSON.parse(raw || '{}') as Record<string, unknown>);
			} catch (error) {
				reject(error);
			}
		});
		request.on('error', reject);
	});
}

function sendRawTcp(host: string, port: number, data: Buffer): Promise<number> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
			socket.write(data, (error) => {
				if (error) {
					reject(error);
					return;
				}
				socket.end();
				resolve(data.byteLength);
			});
		});
		socket.on('error', reject);
		socket.on('timeout', () => {
			socket.destroy(new Error('Raw TCP print timed out'));
		});
	});
}

export default defineConfig({
	resolve: {
		alias: {
			'@wcpos/receipt-renderer': fileURLToPath(
				new URL('../../packages/receipt-renderer/src/index.ts', import.meta.url)
			),
			'@wcpos/printer/encoder': fileURLToPath(
				new URL('../../packages/printer/src/encoder/index.ts', import.meta.url)
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
