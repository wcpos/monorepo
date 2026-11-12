import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';

import { expect, test } from '@playwright/test';

import {
	productWriterAuthorization,
	renewProductWriterIfExpiring,
	WRITER_ACCESS_TOKEN_TTL_MS,
	WRITER_RENEW_MARGIN_MS,
	type WriterAuthorization,
} from './search-probe';
import {
	createWriterAuthFile,
	HOLDER_RENEW_LEAD_MS,
	HOLDER_TICK_MS,
	requestWriterRenewal,
	WriterLoginHolder,
	writeWriterAuthFile,
} from './writer-login-holder';

import type { APIRequestContext } from '@playwright/test';

/** Unit pins for the shard's writer login holder: fake store, fake logins, injected clock. No network. */
const STORE = 'https://store.test';
const OTHER = 'https://other.test';
const files: string[] = [];

test.beforeEach(() => {
	process.env.E2E_PRODUCT_WRITER_USER = 'writer';
	process.env.E2E_PRODUCT_WRITER_PASS = 'secret';
});
test.afterEach(() => {
	delete process.env.E2E_PRODUCT_WRITER_USER;
	delete process.env.E2E_PRODUCT_WRITER_PASS;
	for (const file of files.splice(0))
		fs.rmSync(path.dirname(file), { recursive: true, force: true });
});

function authFile(): string {
	const file = createWriterAuthFile();
	files.push(file);
	return file;
}

function fakeClock(randomValue = 0.5) {
	let now = 1_800_000_000_000;
	const sleeps: number[] = [];
	const clock = {
		sleeps,
		onSleep: async () => {},
		advance: (ms: number) => (now += ms),
		now: () => now,
		random: () => randomValue,
		sleep: async (ms: number) => {
			sleeps.push(ms);
			now += ms;
			await clock.onSleep();
		},
	};
	return clock;
}

/** Holder logins, counted; each token lives the plugin's 30 minutes from the fake clock's now. */
function fakeLogin(clock: { now: () => number }, onLogin?: (storeUrl: string) => Promise<void>) {
	const logins: string[] = [];
	const login = async (storeUrl: string): Promise<WriterAuthorization> => {
		logins.push(storeUrl);
		await onLogin?.(storeUrl);
		return {
			transport: 'query',
			value: `token-${logins.length}`,
			expiresAt: clock.now() + WRITER_ACCESS_TOKEN_TTL_MS,
		};
	};
	return { logins, login };
}

/** wc/v3 reads answer `status(token)`; any wcpos-auth hit is a worker's own login. */
function fakeStore(status: (token: string | undefined) => number = () => 200) {
	const workerLogins: string[] = [];
	const reads: (string | undefined)[] = [];
	const request = {
		get: async (url: string, options?: { params?: Record<string, string> }) => {
			if (url.includes('/wcpos-auth/')) {
				workerLogins.push(url);
				return {
					ok: () => true,
					status: () => 200,
					text: async () =>
						'<input name="_wpnonce" value="nonce"><input name="auth_session" value="session">',
				};
			}
			reads.push(options?.params?.authorization);
			const code = status(options?.params?.authorization);
			return { ok: () => code >= 200 && code < 300, status: () => code, json: async () => [] };
		},
		post: async (url: string) => {
			workerLogins.push(url);
			return {
				status: () => 302,
				headers: () => ({ location: 'https://localhost/cb?access_token=worker-token' }),
			};
		},
	} as unknown as APIRequestContext;
	return { request, workerLogins, reads };
}

function holderFor(
	file: string,
	clock: { now: () => number },
	login: (storeUrl: string) => Promise<WriterAuthorization>,
	storeUrls = [STORE]
) {
	const renewBelowMs = WRITER_RENEW_MARGIN_MS + HOLDER_RENEW_LEAD_MS;
	return new WriterLoginHolder({ file, storeUrls, login, renewBelowMs, now: clock.now });
}

test('(a) over a 60-minute shard two workers never log in; the holder logs in at setup, then every ~8 minutes', async () => {
	const clock = fakeClock();
	const file = authFile();
	const holder = fakeLogin(clock);
	const shardHolder = holderFor(file, clock, holder.login);
	const store = fakeStore();
	const source = { file, now: clock.now, sleep: clock.sleep, random: clock.random };
	await shardHolder.tick();
	const writers = await Promise.all(
		[0, 1].map(() => productWriterAuthorization(store.request, STORE, source))
	);
	for (let elapsed = HOLDER_TICK_MS; elapsed <= 60 * 60_000; elapsed += HOLDER_TICK_MS) {
		clock.advance(HOLDER_TICK_MS);
		await shardHolder.tick();
		if (elapsed % 60_000 !== 0) continue;
		await Promise.all(
			writers.map(async (writer) => {
				await renewProductWriterIfExpiring(store.request, STORE, writer!, source);
				expect(writer!.expiresAt - clock.now()).toBeGreaterThanOrEqual(WRITER_RENEW_MARGIN_MS);
				await productWriterAuthorization(store.request, STORE, source);
			})
		);
	}
	expect(store.workerLogins).toEqual([]);
	// Setup at 0:00, then renewals at 8:15, 16:30, 24:45, 33:00, 41:15, 49:30 and 57:45.
	expect(holder.logins).toHaveLength(8);
	expect(clock.sleeps).toEqual([]);
});

test('(b) the holder never runs two logins at once, across stores and renewal requests', async () => {
	const clock = fakeClock();
	const file = authFile();
	let inFlight = 0;
	let maxInFlight = 0;
	const holder = fakeLogin(clock, async () => {
		inFlight += 1;
		maxInFlight = Math.max(maxInFlight, inFlight);
		// A worker's renewal request lands while the first login is still running.
		if (holder.logins.length === 1) requestWriterRenewal(file, STORE);
		await new Promise((resolve) => setTimeout(resolve, 10));
		inFlight -= 1;
	});
	const shardHolder = holderFor(file, clock, holder.login, [STORE, OTHER]);
	// The interval fires again while the setup tick's logins are still running.
	await Promise.all([shardHolder.tick(), shardHolder.tick()]);
	expect(maxInFlight).toBe(1);
	expect(holder.logins).toEqual([STORE, OTHER, STORE]);
});

test('(c) a reader with less than the margin left waits for the holder instead of logging in', async () => {
	const clock = fakeClock();
	const file = authFile();
	const holder = fakeLogin(clock);
	const shardHolder = holderFor(file, clock, holder.login);
	const store = fakeStore();
	await shardHolder.tick();
	clock.advance(WRITER_ACCESS_TOKEN_TTL_MS - WRITER_RENEW_MARGIN_MS + 60_000);
	clock.onSleep = async () => {
		if (clock.sleeps.length === 3) await shardHolder.tick();
	};
	const source = { file, now: clock.now, sleep: clock.sleep, random: clock.random };
	const writer = await productWriterAuthorization(store.request, STORE, source);
	expect(writer?.value).toBe('token-2');
	expect(clock.sleeps).toEqual([1_000, 1_000, 1_000]);
	expect(store.workerLogins).toEqual([]);
	expect(holder.logins).toHaveLength(2);
});

for (const [randomValue, jitter] of [
	[0, 2_000],
	[1, 5_000],
] as const) {
	test(`(d) a refused read waits ${jitter} ms at random ${randomValue}, re-reads, asks one renewal, retries once`, async () => {
		const clock = fakeClock(randomValue);
		const file = authFile();
		const holder = fakeLogin(clock);
		const shardHolder = holderFor(file, clock, holder.login);
		await shardHolder.tick();
		clock.onSleep = () => shardHolder.tick();
		const source = { file, now: clock.now, sleep: clock.sleep, random: clock.random };

		const raced = fakeStore((token) => (token === 'token-1' ? 401 : 200));
		const writer = await productWriterAuthorization(raced.request, STORE, source);
		expect(writer?.value).toBe('token-2');
		expect(clock.sleeps).toEqual([jitter, 1_000, jitter]);
		expect(raced.reads).toEqual(['token-1', 'token-1', 'token-2']);
		expect(holder.logins).toHaveLength(2);

		clock.sleeps.length = 0;
		const refused = fakeStore(() => 401);
		await expect(productWriterAuthorization(refused.request, STORE, source)).rejects.toThrow(
			'Configured product-writer authentication failed (HTTP 401)'
		);
		expect(clock.sleeps).toEqual([jitter, 1_000, jitter]);
		expect(refused.reads).toEqual(['token-2', 'token-2', 'token-3']);
		expect(holder.logins).toHaveLength(3);
		expect(raced.workerLogins.concat(refused.workerLogins)).toEqual([]);
	});
}

test('(e) the auth file is replaced atomically and readable only by its owner', async () => {
	const file = authFile();
	const published = (n: number): Record<string, WriterAuthorization> =>
		Object.fromEntries(
			Array.from({ length: 2_000 }, (_, i) => [
				`https://store-${i}.test`,
				{ transport: 'query' as const, value: `token-${n}-${'x'.repeat(200)}`, expiresAt: n },
			])
		);
	writeWriterAuthFile(file, published(0));
	// A second thread reads while this one rewrites ~0.5 MB maps: a torn read fails JSON.parse.
	const reader = new Worker(
		`const fs = require('fs');
		const { workerData, parentPort } = require('worker_threads');
		let reads = 0, torn = 0;
		const until = Date.now() + workerData.ms;
		while (Date.now() < until) {
			try { JSON.parse(fs.readFileSync(workerData.file, 'utf8')); reads += 1; } catch { torn += 1; }
		}
		parentPort.postMessage({ reads, torn });`,
		{ eval: true, workerData: { file, ms: 1_500 } }
	);
	let result: { reads: number; torn: number } | undefined;
	reader.once('message', (message) => (result = message));
	for (let n = 1; !result; n += 1) {
		writeWriterAuthFile(file, published(n));
		await new Promise((resolve) => setImmediate(resolve));
	}
	await reader.terminate();
	expect(result.torn).toBe(0);
	expect(result.reads).toBeGreaterThan(0);
	expect(fs.statSync(file).mode & 0o777).toBe(0o600);
	expect(fs.readdirSync(path.dirname(file))).toEqual(['writer-auth.json']);
});
