import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { appendFile, readdir, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ACCOUNT_ID = 'd9df0d95f1cee465811e977842e5063a'; // Account owning the CDN resources.
const KV_NAMESPACE = '0ddbce1d02ad40f5868c1e14cfd5b3f2'; // cdn-pointers control plane.
const API_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`; // Scoped REST API.
const CDN_ORIGIN = 'https://cdn.wcpos.com'; // The Worker: uploads go through it (the API edge 403s keys with '...', e.g. [...orderId] chunks) and it verifies what it serves.
const MANIFEST_URL = `${CDN_ORIGIN}/manifest`; // Verify what the public Worker serves.
const BUILD_PREFIX = 'build'; // Preserve the web-bundle's emitted file paths.
const DESCRIPTOR_FILE = 'bundle.json'; // Written last: its presence marks a complete upload.
const SIGNATURE_FILE = 'bundle.sig'; // Base64 signature stored beside the descriptor.
const METADATA_FILE = 'metadata.json'; // The build's entry CSS and JS contract.
const WORKER_FILE = 'sqlite.worker.js'; // Must use the same worker as the release gate.
const NEXT_LANE = 'next'; // Only this publisher's development lane may move a pointer.
const BUILD_HASH = 'sha256'; // Address the sorted path/SRI records, not build metadata.
const BUILD_ID_LENGTH = 16; // The Worker's content-address format.
const SRI_HASH = 'sha384'; // Browser Subresource Integrity algorithm.
const SIGN_HASH = 'sha256'; // ECDSA digest shared with WebCrypto.
const SIGN_ENCODING = 'ieee-p1363'; // WebCrypto consumes raw r||s, not ASN.1 DER.
const VERIFY_KEY = { name: 'ECDSA', namedCurve: 'P-256' }; // Browser-supported signing curve.
const VERIFY_ALGORITHM = { name: 'ECDSA', hash: 'SHA-256' }; // Loader verification contract.
const VERIFY_DEADLINE_MS = 90_000; // KV can take up to 60 seconds to propagate.
const POLL_INITIAL_MS = 1_000; // Start promptly when KV is already visible.
const POLL_MAX_MS = 10_000; // Bound request frequency during propagation.
const POLL_MULTIPLIER = 2; // Exponential backoff within the fixed verification deadline.
const WORKER_ASSIGNMENT = /(RXDB_VERSION|(var |,)[A-Za-z_$][A-Za-z0-9_$]*) *= *["'][0-9]+\.[0-9]+\.[0-9]+["']/g; // Exact first grep in worker_rxdb_version().
const WORKER_VERSION = /[0-9]+\.[0-9]+\.[0-9]+/g; // Exact second grep in worker_rxdb_version().
const DEFAULT_TYPE = 'application/octet-stream'; // Unknown assets are served as bytes.
const CONTENT_TYPES = { // Explicit MIME types for every extension the build emits.
	'.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css',
	'.json': 'application/json', '.map': 'application/json', '.wasm': 'application/wasm',
	'.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
	'.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.txt': 'text/plain',
	'.ico': 'image/x-icon', '.sig': 'text/plain',
};

export function canonicalJson(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		return `{${Object.keys(value).sort().map((key) =>
			`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

export function computeSri(bytes) {
	return `${SRI_HASH}-${createHash(SRI_HASH).update(bytes).digest('base64')}`;
}

export function computeBuildId(sri) {
	const records = Object.entries(sri).map(([path, hash]) => `${path}\t${hash}\n`).sort().join('');
	return createHash(BUILD_HASH).update(records).digest('hex').slice(0, BUILD_ID_LENGTH);
}

export function workerRxdbVersion(source) {
	const versions = [...new Set((source.match(WORKER_ASSIGNMENT) ?? []).flatMap(
		(assignment) => assignment.match(WORKER_VERSION)))];
	if (!versions.length) throw new Error('no RXDB_VERSION found in the worker');
	if (versions.length !== 1) throw new Error(`more than one RXDB_VERSION candidate: ${versions.join(' ')}`);
	return versions[0];
}

export function buildDescriptor({ appVersion, monorepoSha, runId, metadata, sri, workerVersion,
	lane = appVersion.split('.').slice(0, 2).join('.'), builtAt = new Date().toISOString() }) {
	return {
		app_version: appVersion, build_id: computeBuildId(sri), built_at: builtAt,
		files: { bundles: metadata.bundles ?? [metadata.fileMetadata.web.bundle], css: metadata.fileMetadata.web.css },
		lane, monorepo_sha: monorepoSha, prerelease: lane === NEXT_LANE || appVersion.includes('-'),
		run_id: runId, sri, worker_rxdb_version: workerVersion,
	};
}

export function signDescriptor(descriptor, privateKey) {
	return sign(SIGN_HASH, Buffer.from(descriptor), { key: privateKey, dsaEncoding: SIGN_ENCODING }).toString('base64');
}

export async function verifyDescriptorSignature(descriptor, signature, publicJwk) {
	const key = await globalThis.crypto.subtle.importKey('jwk', publicJwk, VERIFY_KEY, false, ['verify']);
	return globalThis.crypto.subtle.verify(VERIFY_ALGORITHM, key,
		Buffer.from(signature, 'base64'), Buffer.from(descriptor));
}

async function readBuild(buildDir, prefix = '', files = {}) {
	for (const entry of await readdir(join(buildDir, prefix), { withFileTypes: true })) {
		const path = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) await readBuild(buildDir, path, files);
		else files[path] = await readFile(join(buildDir, path));
	}
	return files;
}

function encodePath(path) {
	return path.split('/').map(encodeURIComponent).join('/');
}

async function verifyManifest(fetch, descriptor, ref) {
	const url = new URL(MANIFEST_URL);
	url.search = new URLSearchParams({ ref, plugin: descriptor.app_version, worker: descriptor.worker_rxdb_version });
	const deadline = Date.now() + VERIFY_DEADLINE_MS;
	let delay = POLL_INITIAL_MS;
	while (Date.now() < deadline) {
		const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
		if (response.ok) {
			const manifest = await response.json();
			if (manifest.build_id === descriptor.build_id) return manifest;
		} else if (response.status !== 404) {
			throw new Error(`Manifest verification HTTP ${response.status}`);
		}
		await sleep(Math.max(0, Math.min(delay, deadline - Date.now())));
		delay = Math.min(delay * POLL_MULTIPLIER, POLL_MAX_MS);
	}
	throw new Error(`Manifest did not resolve to ${descriptor.build_id} for ref ${ref} within 90 seconds`);
}

export async function publish({ buildDir, appVersion, monorepoSha, runId, lane, webBundleCommit,
	token, publishToken, signingPrivateKey, fetch }) {
	console.log('CDN: hash build and construct descriptor');
	const files = await readBuild(buildDir);
	const sri = Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, computeSri(bytes)]));
	const descriptor = buildDescriptor({ appVersion, monorepoSha, runId, lane, sri,
		metadata: JSON.parse(files[METADATA_FILE].toString()),
		workerVersion: workerRxdbVersion(files[WORKER_FILE].toString()) });
	const canonical = canonicalJson(descriptor);
	console.log('CDN: sign descriptor and verify with WebCrypto');
	const privateKey = createPrivateKey(signingPrivateKey);
	const signature = signDescriptor(canonical, privateKey);
	const publicJwk = createPublicKey(privateKey).export({ format: 'jwk' });
	if (!await verifyDescriptorSignature(canonical, signature, publicJwk)) {
		throw new Error('Descriptor signature failed WebCrypto verification');
	}
	const request = async (url, method = 'GET', body, type, allowMissing = false, bearer = token) => {
		const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
		if (type) headers['Content-Type'] = type;
		if (body) headers['Content-Length'] = String(Buffer.byteLength(body));
		const response = await fetch(url, { method, headers, body });
		if (!response.ok && !(allowMissing && response.status === 404)) {
			const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
			throw new Error(`Cloudflare ${method} ${new URL(url).pathname} failed: HTTP ${response.status} ${detail}`);
		}
		return response;
	};
	// Objects are written through the Worker's upload route (bearer = CDN_PUBLISH_TOKEN) and
	// checked for existence through its public /b/ route; the key under bundles/<id>/ is the path.
	const upload = (path, body, type) => request(`${CDN_ORIGIN}/upload/${descriptor.build_id}/${encodePath(path)}`,
		'PUT', body, type, false, publishToken);
	const kvUrl = (key) => `${API_BASE}/storage/kv/namespaces/${KV_NAMESPACE}/values/${encodeURIComponent(key)}`;
	const readKv = async (key, missing) => {
		const response = await request(kvUrl(key), 'GET', undefined, undefined, true);
		return response.status === 404 ? missing : response.json();
	};
	const writeKv = (key, value) => request(kvUrl(key), 'PUT', JSON.stringify(value), CONTENT_TYPES['.json']);
	// The R2 REST object API answers HEAD with 405, so existence is a GET of the small descriptor.
	const existing = await request(`${CDN_ORIGIN}/b/${descriptor.build_id}/${DESCRIPTOR_FILE}`, 'GET', undefined, undefined, true, null);
	console.log(existing.status === 200 ? 'CDN: completed build exists; skip R2 uploads' : 'CDN: upload build to R2');
	if (existing.status !== 200) {
		for (const path of Object.keys(files).sort()) {
			await upload(`${BUILD_PREFIX}/${path}`, files[path], CONTENT_TYPES[extname(path).toLowerCase()] ?? DEFAULT_TYPE);
		}
		await upload(SIGNATURE_FILE, Buffer.from(signature), CONTENT_TYPES['.sig']);
		await upload(DESCRIPTOR_FILE, Buffer.from(canonical), CONTENT_TYPES['.json']);
	}
	console.log('CDN: write KV descriptor, refs, index and next pointer');
	await writeKv(`bundle:${descriptor.build_id}`, { descriptor: canonical, signature });
	await writeKv(`ref:${monorepoSha}`, { build_id: descriptor.build_id });
	if (webBundleCommit) await writeKv(`ref:${webBundleCommit}`, { build_id: descriptor.build_id });
	const indexKey = `index:${descriptor.lane}`;
	const index = await readKv(indexKey, []);
	const { build_id, worker_rxdb_version, prerelease, app_version, built_at } = descriptor;
	await writeKv(indexKey, [{ build_id, worker_rxdb_version, prerelease, app_version, built_at },
		...index.filter((entry) => entry.build_id !== build_id)]);
	if (descriptor.lane === NEXT_LANE) {
		const pointerKey = `lane:${NEXT_LANE}`;
		const old = await readKv(pointerKey, { current: null, previous: null, rolled_back_from: null,
			killed: false, message: null, updated_at: null, updated_by: null });
		await writeKv(pointerKey, { ...old, current: build_id,
			previous: old.current !== build_id ? old.current : old.previous,
			rolled_back_from: null, updated_at: built_at, updated_by: `publish-web-bundle run ${runId}` });
	}
	console.log('CDN: verify public manifest and entry asset integrity');
	const refs = descriptor.lane === NEXT_LANE ? [monorepoSha, NEXT_LANE] : [monorepoSha];
	for (const ref of refs) {
		const manifest = await verifyManifest(fetch, descriptor, ref);
		for (const path of [descriptor.files.css, ...descriptor.files.bundles]) {
			const response = await fetch(`${manifest.bundle_base}/${encodePath(path)}`);
			if (!response.ok) throw new Error(`Asset verification HTTP ${response.status}: ${path}`);
			if (computeSri(Buffer.from(await response.arrayBuffer())) !== sri[path]) {
				throw new Error(`SRI mismatch: ${path}`);
			}
		}
	}
	return descriptor;
}

async function main() {
	const { values } = parseArgs({ options: Object.fromEntries([
		'build-dir', 'app-version', 'monorepo-sha', 'run-id', 'lane', 'web-bundle-commit',
	].map((name) => [name, { type: 'string' }])) });
	for (const name of ['build-dir', 'app-version', 'monorepo-sha', 'run-id']) {
		if (!values[name]) throw new Error(`Missing --${name}`);
	}
	if (values.lane && values.lane !== NEXT_LANE) throw new Error('--lane must be next when supplied');
	if (!process.env.CLOUDFLARE_CDN_TOKEN || !process.env.CDN_PUBLISH_TOKEN || !process.env.CDN_SIGNING_PRIVATE_KEY) {
		throw new Error('CLOUDFLARE_CDN_TOKEN, CDN_PUBLISH_TOKEN and CDN_SIGNING_PRIVATE_KEY are required');
	}
	const descriptor = await publish({ buildDir: values['build-dir'], appVersion: values['app-version'],
		monorepoSha: values['monorepo-sha'], runId: values['run-id'], lane: values.lane,
		webBundleCommit: values['web-bundle-commit'], token: process.env.CLOUDFLARE_CDN_TOKEN,
		publishToken: process.env.CDN_PUBLISH_TOKEN,
		signingPrivateKey: process.env.CDN_SIGNING_PRIVATE_KEY, fetch: globalThis.fetch });
	if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `build_id=${descriptor.build_id}\n`);
	console.log(`CDN: published ${descriptor.build_id}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(`CDN publish failed: ${error.message}`);
		process.exitCode = 1;
	});
}
