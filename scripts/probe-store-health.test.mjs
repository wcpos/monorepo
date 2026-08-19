import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const probeScript = new URL('./probe-store-health.mjs', import.meta.url);

async function withServer(handler, callback) {
	const server = createServer(handler);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const { port } = server.address();

	try {
		await callback(`http://127.0.0.1:${port}`);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
}

async function runProbe(storeUrl, phase) {
	return execFileAsync(process.execPath, [probeScript.pathname, storeUrl, 'test store', phase]);
}

test('retries the auth probe with the plain-permalink route after a pretty-route 404', async () => {
	const requests = [];
	await withServer(
		(request, response) => {
			requests.push(request.url);
			response.writeHead(request.url.startsWith('/wp-json/') ? 404 : 401).end();
		},
		async (storeUrl) => {
			const { stdout } = await runProbe(storeUrl, 'before the tests started');
			assert.match(stdout, /healthy/);
		}
	);

	assert.deepEqual(requests, [
		'/wp-json/wcpos/v2/auth/test',
		'/index.php?rest_route=/wcpos/v2/auth/test',
		'/wp-json/wcpos/v2/auth/test',
		'/index.php?rest_route=/wcpos/v2/auth/test',
		'/wp-json/wcpos/v2/auth/test',
		'/index.php?rest_route=/wcpos/v2/auth/test',
	]);
});

test('reports the caller-supplied phase when the store is saturated', async () => {
	await withServer(
		(request) => {
			request.socket.destroy();
		},
		async (storeUrl) => {
			const { stdout } = await runProbe(storeUrl, 'after the tests failed');
			assert.match(stdout, /::error title=E2E store saturated::/);
			assert.match(stdout, /after the tests failed/);
			assert.doesNotMatch(stdout, /before the tests started/i);
		}
	);
});
