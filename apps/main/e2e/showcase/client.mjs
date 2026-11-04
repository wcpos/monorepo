/** REST client for the showcase targets. Reads retry a blip; writes never retry. Errors never carry a body. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
	isTransientStatus,
	TransientStoreError,
	withStoreRetry,
} from '../../../../scripts/store-transient-retry.mjs';
import { TARGETS } from './targets.mjs';

/** The demo store shares its host with production, so writes run one at a time with this gap after each. */
export const WRITE_GAP_MS = 250;
const PAGE_SIZE = 100;

const maskPath = (path) => path.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');

export class StoreError extends Error {
	constructor({ method, path, status, code }) {
		super(`${method} ${maskPath(path)} -> ${status} ${code ?? '-'}`);
		Object.assign(this, { name: 'StoreError', method, path: maskPath(path), status, code });
	}
}

/** Runs the credentials command (no shell) and parses one JSON line in memory. */
export async function readCredentials(commandPath) {
	const { stdout } = await promisify(execFile)(commandPath, [], {
		maxBuffer: 64 * 1024,
		timeout: 30_000,
	}).catch(() => {
		throw new Error('the credentials command failed');
	});
	const line = stdout.split('\n').find((l) => l.trim()) ?? '';
	const { username, password } =
		(await Promise.resolve(line)
			.then(JSON.parse)
			.catch(() => null)) ?? {};
	if (typeof username === 'string' && typeof password === 'string' && username && password)
		return { username, password };
	// the error below names no value
	throw new Error('the credentials command did not print one JSON line with username and password');
}

export function createClient({
	url,
	credentials,
	fetchImpl = fetch,
	sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
	log = console.log,
}) {
	if (
		typeof url !== 'string' ||
		!url.startsWith('https://') ||
		!Object.values(TARGETS).some((t) => t.url === url)
	) {
		throw new Error('refusing a url that is not an https showcase target');
	}
	const authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
	const stats = { reads: 0, writes: 0 };

	async function request(method, path, { params, body } = {}) {
		const href = new URL(url + path);
		for (const [k, v] of Object.entries(params ?? {})) href.searchParams.set(k, String(v));
		const headers = {
			authorization,
			accept: 'application/json',
			...(body ? { 'content-type': 'application/json' } : {}),
		};
		const res = await fetchImpl(href.href, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		});
		const json = await res
			.text()
			.then(JSON.parse)
			.catch(() => undefined);
		if (res.ok && json !== undefined) return json;
		const code =
			typeof json?.code === 'string' && /^[a-z0-9_]+$/.test(json.code) ? json.code : null;
		throw new StoreError({ method, path, status: res.status, code });
	}

	/** A read retries a transient status, and a 2xx that is not JSON (an error page served as 200). */
	const transient = (err) =>
		err instanceof StoreError && (isTransientStatus(err.status) || err.status < 300);
	const readOnce = (path, params) => {
		stats.reads += 1;
		return request('GET', path, { params }).catch((err) => {
			throw transient(err) ? new TransientStoreError(err.message) : err;
		});
	};
	const get = (path, params) =>
		withStoreRetry(`GET ${maskPath(path)}`, () => readOnce(path, params), { sleep, warn: log });

	async function getAll(path, params = {}) {
		const rows = [];
		for (let page = 1; ; page += 1) {
			const batch = await get(path, { ...params, per_page: PAGE_SIZE, page });
			rows.push(...batch);
			if (batch.length < PAGE_SIZE) return rows;
		}
	}

	const writer = (method) => async (path, body) => {
		stats.writes += 1;
		try {
			return await request(method, path, { body });
		} finally {
			await sleep(WRITE_GAP_MS);
		}
	};
	return { get, getAll, post: writer('POST'), put: writer('PUT'), stats };
}
