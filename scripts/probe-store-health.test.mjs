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

async function runProbe(storeUrl, phase, env = {}) {
	return execFileAsync(process.execPath, [probeScript.pathname, storeUrl, 'test store', phase], {
		env: { ...process.env, ...env },
	});
}

const writerEnv = {
	E2E_PRODUCT_WRITER_USER: 'writer',
	E2E_PRODUCT_WRITER_PASS: 'password',
};

function handleAuth(request, response) {
	if (request.url.startsWith('/wp-json/wcpos/v2/auth/test')) {
		response.writeHead(401).end();
		return true;
	}
	if (request.url.startsWith('/wcpos-auth/') && request.method === 'GET') {
		response.setHeader('set-cookie', 'probe=session');
		response.end(
			'<input name="_wpnonce" value="nonce"><input name="auth_session" value="session">'
		);
		return true;
	}
	if (request.url.startsWith('/wcpos-auth/') && request.method === 'POST') {
		response.writeHead(302, { location: 'https://localhost/cb?access_token=probe-token&state=ok' }).end();
		return true;
	}
	return false;
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

test('retries the catalogue probe with the plain-permalink route', async () => {
	const productRequests = [];
	await withServer(
		(request, response) => {
			if (handleAuth(request, response)) return;
			productRequests.push(request.url);
			response.writeHead(request.url.startsWith('/wp-json/') ? 404 : 200).end('[]');
		},
		async (storeUrl) => {
			const { stdout } = await runProbe(storeUrl, 'before the tests started', writerEnv);
			assert.match(stdout, /products\(50\) median .*\(statuses: 200,200,200\)/);
		}
	);

	assert.equal(productRequests.filter((url) => url.startsWith('/wp-json/')).length, 3);
	assert.equal(productRequests.filter((url) => url.startsWith('/index.php?rest_route=')).length, 3);
});

test('times catalogue response bodies and uses their latency in the verdict', { timeout: 10_000 }, async () => {
	let productRequest = 0;
	await withServer(
		(request, response) => {
			if (handleAuth(request, response)) return;
			productRequest += 1;
			response.writeHead(200, { 'content-type': 'application/json' });
			response.flushHeaders();
			if (productRequest <= 2) setTimeout(() => response.end('[]'), 3_100);
			else response.end('[]');
		},
		async (storeUrl) => {
			const { stdout } = await runProbe(storeUrl, 'before the tests started', writerEnv);
			assert.match(stdout, /::warning title=E2E store degraded::/);
			assert.doesNotMatch(stdout, /\[store-health\] test store healthy/);
		}
	);
});

test('uses configured token-mint failures in the health verdict', async () => {
	await withServer(
		(request, response) => {
			if (request.url.startsWith('/wp-json/wcpos/v2/auth/test')) {
				response.writeHead(401).end();
				return;
			}
			response.writeHead(503).end('token unavailable');
		},
		async (storeUrl) => {
			const { stdout } = await runProbe(storeUrl, 'before the tests started', writerEnv);
			assert.match(stdout, /products\(50\) not measured \(token mint failed\)/);
			assert.match(stdout, /::error title=E2E store saturated::/);
			assert.doesNotMatch(stdout, /\[store-health\] test store healthy/);
		}
	);
});

test('uses catalogue transport failures in the health verdict', async () => {
	await withServer(
		(request, response) => {
			if (handleAuth(request, response)) return;
			request.socket.destroy();
		},
		async (storeUrl) => {
			const { stdout } = await runProbe(storeUrl, 'before the tests started', writerEnv);
			assert.match(stdout, /::error title=E2E store saturated::/);
			assert.doesNotMatch(stdout, /\[store-health\] test store healthy/);
		}
	);
});
