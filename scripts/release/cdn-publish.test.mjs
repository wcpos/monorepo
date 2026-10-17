import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
	buildDescriptor, canonicalJson, computeBuildId, computeSri, publish,
	signDescriptor, verifyDescriptorSignature, workerRxdbVersion,
} from './cdn-publish.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const signingPrivateKey = privateKey.export({ format: 'pem', type: 'pkcs8' });
const jwk = publicKey.export({ format: 'jwk' });
const metadata = { fileMetadata: { web: { bundle: 'assets/entry.js', css: 'assets/style.css' } } };
const descriptorOptions = {
	appVersion: '2.0.0', monorepoSha: 'a'.repeat(40), runId: '123',
	metadata, sri: { 'z.js': 'sha384-z', 'a.css': 'sha384-a' }, workerVersion: '17.6.0',
	builtAt: '2026-10-17T10:00:00.000Z',
};

test('canonical JSON sorts nested object keys but preserves array order', () => {
	assert.equal(canonicalJson({ z: [{ b: 2, a: 1 }, 3], a: { z: 0, a: 'x' } }),
		'{"a":{"a":"x","z":0},"z":[{"a":1,"b":2},3]}');
	assert.equal(canonicalJson({ 2: 'two', 10: 'ten' }), '{"10":"ten","2":"two"}');
});

test('SRI hashes bytes and build id hashes sorted path-tab-SRI-newline records', () => {
	assert.equal(computeSri(Buffer.from('abc')),
		'sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn');
	const records = 'a.css\tsha384-a\nz.js\tsha384-z\n';
	const expected = createHash('sha256').update(records).digest('hex').slice(0, 16);
	assert.equal(computeBuildId(descriptorOptions.sri), expected);
	assert.equal(computeBuildId({ 'a.css': 'sha384-a', 'z.js': 'sha384-z' }), expected);
	assert.notEqual(computeBuildId({ 'a.css': 'sha384-other', 'z.js': 'sha384-z' }), expected);
});

test('descriptor derives lane and prerelease, prefers bundles, and time is not part of build id', () => {
	const descriptor = buildDescriptor(descriptorOptions);
	assert.deepEqual(descriptor, {
		app_version: '2.0.0', monorepo_sha: 'a'.repeat(40), run_id: '123',
		lane: '2.0', prerelease: false, worker_rxdb_version: '17.6.0',
		built_at: descriptorOptions.builtAt, build_id: computeBuildId(descriptorOptions.sri),
		sri: descriptorOptions.sri, files: { bundles: ['assets/entry.js'], css: 'assets/style.css' },
	});
	assert.equal(buildDescriptor({ ...descriptorOptions, builtAt: 'later' }).build_id, descriptor.build_id);
	assert.equal(buildDescriptor({ ...descriptorOptions, lane: 'next' }).prerelease, true);
	assert.equal(buildDescriptor({ ...descriptorOptions, appVersion: '2.0.0-beta.1' }).prerelease, true);
	assert.deepEqual(buildDescriptor({ ...descriptorOptions,
		metadata: { ...metadata, bundles: ['first.js', 'second.js'] },
	}).files.bundles, ['first.js', 'second.js']);
});

test('worker version extraction matches the release gate including distinct candidates', () => {
	for (const source of ['var Xe="17.6.0";', "RXDB_VERSION = '17.6.0'",
		'var Ut="17.6.0",Wt="17.6.0"', 'var $x = "17.6.0";']) {
		assert.equal(workerRxdbVersion(source), '17.6.0');
	}
	assert.throws(() => workerRxdbVersion('const unrelated = "17.6.0"'), /no RXDB_VERSION/);
	assert.throws(() => workerRxdbVersion('var X="17.6.0",Y="17.4.0"'), /more than one/);
});

test('raw P-256 signature verifies with WebCrypto JWK and rejects changed bytes', async () => {
	const descriptor = canonicalJson(buildDescriptor(descriptorOptions));
	const signature = signDescriptor(descriptor, signingPrivateKey);
	assert.equal(Buffer.from(signature, 'base64').length, 64);
	const key = await globalThis.crypto.subtle.importKey('jwk', jwk,
		{ name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
	assert.equal(await globalThis.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' },
		key, Buffer.from(signature, 'base64'), Buffer.from(descriptor)), true);
	assert.equal(await verifyDescriptorSignature(descriptor, signature, jwk), true);
	assert.equal(await verifyDescriptorSignature(`${descriptor} `, signature, jwk), false);
});

async function fixture(t, options = {}) {
	const buildDir = await mkdtemp(join(tmpdir(), 'cdn-publish-'));
	t.after(() => rm(buildDir, { recursive: true, force: true }));
	const files = {
		'metadata.json': JSON.stringify(metadata), 'assets/entry.js': 'console.log("bundle");',
		'assets/style.css': 'body { color: red; }', 'sqlite.worker.js': 'var Xe="17.6.0";',
		...options.files,
	};
	for (const [path, bytes] of Object.entries(files)) {
		await mkdir(join(buildDir, path, '..'), { recursive: true });
		await writeFile(join(buildDir, path), bytes);
	}
	const calls = [];
	const kv = new Map(Object.entries(options.kv ?? {}));
	const r2 = new Map();
	const storedDescriptor = canonicalJson(buildDescriptor({ ...descriptorOptions,
		appVersion: options.appVersion ?? '2.0.0', lane: options.release ? undefined : 'next',
		sri: Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, computeSri(bytes)])),
		builtAt: '2020-01-01T00:00:00.000Z',
	}));
	const storedSignature = signDescriptor(options.badSignature ? `${storedDescriptor} ` : storedDescriptor, signingPrivateKey);
	const manifestResponses = [...(options.manifestResponses ?? [])];
	const fetch = async (input, init = {}) => {
		const url = new URL(input);
		const method = init.method ?? 'GET';
		calls.push({ url, method, ...init });
		if (options.fail?.(url, method)) return new Response('', { status: 503 });
		if (url.hostname === 'api.cloudflare.com') {
			assert.equal(init.headers.Authorization, 'Bearer test-token');
			const kvPrefix = '/client/v4/accounts/d9df0d95f1cee465811e977842e5063a/storage/kv/namespaces/0ddbce1d02ad40f5868c1e14cfd5b3f2/values/';
			assert.ok(url.pathname.startsWith(kvPrefix));
			const key = decodeURIComponent(url.pathname.slice(kvPrefix.length));
			if (method === 'PUT') {
				assert.equal(init.headers['Content-Type'], 'application/json');
				kv.set(key, JSON.parse(init.body));
				return new Response('{}');
			}
			assert.equal(method, 'GET');
			return kv.has(key) ? Response.json(kv.get(key)) : new Response('', { status: 404 });
		}
		assert.equal(url.hostname, 'cdn.wcpos.com');
		if (url.pathname.startsWith('/upload/')) {
			assert.equal(method, 'PUT');
			assert.equal(init.headers.Authorization, 'Bearer test-publish-token');
			assert.equal(init.headers['Content-Length'], String(Buffer.byteLength(init.body)));
			const [, , buildId, ...rest] = url.pathname.split('/');
			const key = `bundles/${buildId}/${decodeURIComponent(rest.join('/'))}`;
			r2.set(key, { body: Buffer.from(init.body), type: init.headers['Content-Type'] });
			return Response.json({ key });
		}
		if (/^\/b\/[0-9a-f]{16}\/bundle\.(json|sig)$/.test(url.pathname)) {
			assert.equal(init.headers?.Authorization, undefined);
			const body = url.pathname.endsWith('.json') ? storedDescriptor : storedSignature;
			return new Response(options.exists ? body : null, { status: options.exists ? 200 : 404 });
		}
		assert.equal(init.headers?.Authorization, undefined);
		if (url.pathname === '/manifest') {
			assert.equal(url.searchParams.get('plugin'), options.appVersion ?? '2.0.0');
			assert.equal(url.searchParams.get('worker'), '17.6.0');
			const ref = url.searchParams.get('ref');
			assert.ok([descriptorOptions.monorepoSha, 'next'].includes(ref));
			if (manifestResponses.length) return manifestResponses.shift();
			const { build_id } = kv.get(`ref:${descriptorOptions.monorepoSha}`);
			return Response.json({ build_id, bundle_base: `https://cdn.wcpos.com/b/${build_id}/build` });
		}
		const path = decodeURIComponent(url.pathname.split('/build/')[1]);
		assert.ok(Object.hasOwn(files, path));
		return new Response(options.corrupt ? 'corrupted' : files[path]);
	};
	return { calls, kv, r2, files, storedDescriptor, storedSignature, args: {
		buildDir, appVersion: options.appVersion ?? '2.0.0', monorepoSha: descriptorOptions.monorepoSha,
		runId: '123', lane: options.release ? undefined : 'next', token: 'test-token', publishToken: 'test-publish-token', signingPrivateKey, fetch,
	} };
}

test('publish uploads bytes with types, descriptor last, four KV records, and verifies entry assets', async (t) => {
	const f = await fixture(t);
	const result = await publish(f.args);
	const prefix = `bundles/${result.build_id}/`;
	assert.deepEqual([...f.r2.keys()], [
		...Object.keys(f.files).sort().map((path) => `${prefix}build/${path}`),
		`${prefix}bundle.sig`, `${prefix}bundle.json`,
	]);
	for (const [path, bytes] of Object.entries(f.files)) {
		assert.deepEqual(f.r2.get(`${prefix}build/${path}`).body, Buffer.from(bytes));
	}
	assert.equal(f.r2.get(`${prefix}build/assets/entry.js`).type, 'application/javascript');
	assert.equal(f.r2.get(`${prefix}build/assets/style.css`).type, 'text/css');
	assert.equal(f.r2.get(`${prefix}build/metadata.json`).type, 'application/json');
	assert.equal(f.r2.get(`${prefix}bundle.json`).type, 'application/json');
	assert.equal(f.r2.get(`${prefix}bundle.sig`).type, 'text/plain');
	assert.equal(f.calls.filter((c) => c.method === 'PUT' && c.url.pathname.includes('/values/')).length, 4);
	const stored = f.kv.get(`bundle:${result.build_id}`);
	assert.deepEqual(Object.keys(stored).sort(), ['descriptor', 'signature']);
	assert.equal(stored.descriptor, f.r2.get(`${prefix}bundle.json`).body.toString());
	assert.equal(stored.signature, f.r2.get(`${prefix}bundle.sig`).body.toString());
	assert.equal(await verifyDescriptorSignature(stored.descriptor, stored.signature, jwk), true);
	assert.deepEqual(f.kv.get(`ref:${descriptorOptions.monorepoSha}`), { build_id: result.build_id });
	assert.deepEqual(f.kv.get('index:next'), [{ build_id: result.build_id,
		worker_rxdb_version: '17.6.0', prerelease: true, app_version: '2.0.0', built_at: result.built_at }]);
	assert.deepEqual(f.kv.get('lane:next'), { current: result.build_id, previous: null,
		rolled_back_from: null, killed: false, message: null,
		updated_at: result.built_at, updated_by: 'publish-web-bundle run 123' });
	assert.deepEqual(f.calls.filter((c) => c.url.pathname === '/manifest')
		.map((c) => c.url.searchParams.get('ref')), [descriptorOptions.monorepoSha, 'next']);
	assert.ok(f.calls.some((c) => c.url.pathname.endsWith('/assets/entry.js')));
	assert.ok(f.calls.some((c) => c.url.pathname.endsWith('/assets/style.css')));
});

test('next transition preserves kill/message; repeat skips uploads and deduplicates index', async (t) => {
	const f = await fixture(t, { kv: { 'lane:next': { current: 'old', previous: 'older',
		rolled_back_from: 'bad', killed: true, message: 'maintenance' }, 'index:next': [{ build_id: 'old' }] } });
	const first = await publish({ ...f.args, webBundleCommit: 'b'.repeat(40) });
	assert.deepEqual(f.kv.get(`ref:${'b'.repeat(40)}`), { build_id: first.build_id });
	assert.equal(f.kv.get('lane:next').previous, 'old');
	assert.equal(f.kv.get('lane:next').killed, true);
	assert.equal(f.kv.get('lane:next').message, 'maintenance');
	assert.equal(f.kv.get('lane:next').rolled_back_from, null);
	const repeat = await fixture(t, { exists: true, kv: Object.fromEntries(f.kv) });
	const second = await publish(repeat.args);
	assert.equal(second.build_id, first.build_id);
	assert.equal(repeat.r2.size, 0);
	assert.equal(repeat.kv.get('lane:next').previous, 'old');
	assert.deepEqual(repeat.kv.get('index:next').map((entry) => entry.build_id), [first.build_id, 'old']);
	assert.equal(repeat.calls.filter((c) => c.method === 'PUT').length, 4);
	assert.equal(repeat.calls.filter((c) => c.url.pathname === '/manifest').length, 2);
});

test('release publish never reads or writes a lane pointer, even for prereleases', async (t) => {
	const f = await fixture(t, { release: true, appVersion: '2.0.0-beta.1' });
	await publish(f.args);
	assert.ok(f.kv.has('index:2.0'));
	assert.equal(f.calls.some((c) => decodeURIComponent(c.url.pathname).includes('lane:')), false);
	assert.equal(f.calls.filter((c) => c.url.pathname === '/manifest').length, 1);
});

test('existing build reuses the stored signed bytes and timestamp without uploads', async (t) => {
	const f = await fixture(t, { exists: true });
	const result = await publish(f.args);
	assert.deepEqual(f.kv.get(`bundle:${result.build_id}`), {
		descriptor: f.storedDescriptor, signature: f.storedSignature,
	});
	assert.equal(f.kv.get('index:next')[0].built_at, '2020-01-01T00:00:00.000Z');
	assert.equal(result.built_at, '2020-01-01T00:00:00.000Z');
	assert.equal(f.r2.size, 0);
	assert.ok(f.calls.some((c) => c.url.pathname.endsWith('/bundle.sig') && c.method === 'GET'));
});

test('stored signature mismatch is fatal before any writes', async (t) => {
	const f = await fixture(t, { exists: true, badSignature: true });
	await assert.rejects(publish(f.args), /Stored descriptor signature failed WebCrypto verification/);
	assert.equal(f.calls.some((c) => c.method === 'PUT'), false);
});

test('build without sqlite worker fails with the 2.x-only explanation before requests', async (t) => {
	const f = await fixture(t);
	await rm(join(f.args.buildDir, 'sqlite.worker.js'));
	await assert.rejects(publish(f.args), {
		message: 'no sqlite.worker.js in the build: only 2.x builds publish to cdn.wcpos.com',
	});
	assert.equal(f.calls.length, 0);
});

test('publish encodes individual R2 segments and maps other asset extensions', async (t) => {
	const f = await fixture(t, { files: { 'fonts/a #.woff2': 'font', 'opaque.bin': 'binary' } });
	const result = await publish(f.args);
	assert.ok(f.calls.some((c) => c.url.pathname.endsWith('/build/fonts/a%20%23.woff2')));
	assert.equal(f.r2.get(`bundles/${result.build_id}/build/fonts/a #.woff2`).type, 'font/woff2');
	assert.equal(f.r2.get(`bundles/${result.build_id}/build/opaque.bin`).type, 'application/octet-stream');
});

test('invalid signing key is fatal before any network requests', async (t) => {
	const f = await fixture(t);
	await assert.rejects(publish({ ...f.args, signingPrivateKey: 'invalid' }));
	assert.equal(f.calls.length, 0);
});

test('failed asset upload leaves no completion marker or KV writes', async (t) => {
	const f = await fixture(t, { fail: (url, method) => method === 'PUT' && url.pathname.endsWith('/entry.js') });
	await assert.rejects(publish(f.args), /503/);
	assert.equal(f.calls.some((c) => c.method === 'PUT' && c.url.pathname.endsWith('/bundle.json')), false);
	assert.equal(f.kv.size, 0);
});

test('post-publish asset SRI mismatch fails verification', async (t) => {
	const f = await fixture(t, { corrupt: true });
	await assert.rejects(publish(f.args), /SRI mismatch/);
});

test('manifest verification waits through missing and stale KV results without republishing', async (t) => {
	const f = await fixture(t, { release: true, manifestResponses: [
		new Response('', { status: 404 }), Response.json({ build_id: 'old' }),
	] });
	const result = await publish(f.args);
	const requests = f.calls.filter((c) => c.url.pathname === '/manifest');
	assert.equal(requests.length, 3);
	assert.ok(requests.every((c) => c.signal instanceof AbortSignal));
	assert.equal(f.calls.filter((c) => c.method === 'PUT' && c.url.pathname.includes('/values/')).length, 3);
	assert.equal(f.kv.get(`ref:${descriptorOptions.monorepoSha}`).build_id, result.build_id);
});
