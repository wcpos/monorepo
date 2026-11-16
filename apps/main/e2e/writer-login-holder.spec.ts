import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';

import { expect, test } from '@playwright/test';

import {
	productWriterAuthorization,
	publishedWriterAuthorization,
	renewProductWriterIfExpiring,
	WRITER_ACCESS_TOKEN_TTL_MS,
	WRITER_LIFE_SLACK_MS,
	WRITER_RENEW_MARGIN_MS,
	type WriterAuthorization,
	writerLifeNeeded,
	writerLifeNeededMs,
} from './search-probe';
import {
	createWriterAuthFile,
	HOLDER_FAILED_LOGIN_BACKOFF_MS,
	HOLDER_TICK_MS,
	requestWriterRenewal,
	WRITER_AUTH_FILE_ENV,
	WriterLoginHolder,
	writeWriterAuthFile,
} from './writer-login-holder';

import type { APIRequestContext } from '@playwright/test';

/** Unit pins for the shard's writer login holder: fake store, fake logins, injected clock. No network. */
const STORE = 'https://store.test';
const OTHER = 'https://other.test';
const files: string[] = [];

// This file runs inside the E2E worker processes, whose later specs read the real writer env.
const WRITER_ENV = ['E2E_PRODUCT_WRITER_USER', 'E2E_PRODUCT_WRITER_PASS', WRITER_AUTH_FILE_ENV];
const writerEnv = () => WRITER_ENV.map((name) => process.env[name]);
const envAtLoad = writerEnv();
let envBeforeTest: (string | undefined)[] = [];

test.beforeEach(() => {
	envBeforeTest = writerEnv();
	process.env.E2E_PRODUCT_WRITER_USER = 'writer';
	process.env.E2E_PRODUCT_WRITER_PASS = 'secret';
});
test.afterEach(() => {
	WRITER_ENV.forEach((name, i) => {
		if (envBeforeTest[i] === undefined) delete process.env[name];
		else process.env[name] = envBeforeTest[i];
	});
	for (const file of files.splice(0))
		fs.rmSync(path.dirname(file), { recursive: true, force: true });
});
test.afterAll(() => {
	expect(writerEnv()).toEqual(envAtLoad);
});

function authFile(): string {
	const file = createWriterAuthFile();
	files.push(file);
	return file;
}

function fakeClock(randomValue = 0.5) {
	let now = 1_800_000_000_000;
	const sleeps: number[] = [];
	const holderSleeps: number[] = [];
	const clock = {
		sleeps,
		holderSleeps,
		onSleep: async () => {},
		advance: (ms: number) => (now += ms),
		now: () => now,
		random: () => randomValue,
		sleep: async (ms: number) => {
			sleeps.push(ms);
			now += ms;
			await clock.onSleep();
		},
		// The holder's own sleeps take no hook: a tick awaited inside a tick would wait on itself.
		holder: {
			now: () => now,
			random: () => randomValue,
			sleep: async (ms: number) => {
				holderSleeps.push(ms);
				now += ms;
			},
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
	clock: ReturnType<typeof fakeClock>,
	login: (storeUrl: string) => Promise<WriterAuthorization>,
	storeUrls = [STORE],
	validate = async (_storeUrl: string, _authorization: WriterAuthorization) => true
) {
	return new WriterLoginHolder({ file, storeUrls, login, validate, clock: clock.holder });
}

/** A worker that found no token asks, and the holder's next tick answers. */
async function primed(file: string, holder: WriterLoginHolder) {
	requestWriterRenewal(file, STORE, null);
	await holder.tick();
}

test('(a) over a 60-minute shard of 180 s tests the holder logs in for store A only when a test is short, never for B', async () => {
	test.setTimeout(180_000);
	const clock = fakeClock();
	const file = authFile();
	const holder = fakeLogin(clock);
	const shardHolder = holderFor(file, clock, holder.login, [STORE, OTHER]);
	const store = fakeStore();
	clock.onSleep = () => shardHolder.tick();
	const source = { file, now: clock.now, sleep: clock.sleep, random: clock.random };
	const start = clock.now();
	// Each worker's productWriter fixture reads its writer once, at its start.
	const writers = await Promise.all(
		[0, 1].map(() => productWriterAuthorization(store.request, STORE, source))
	);
	while (clock.now() - start < 60 * 60_000) {
		// checkout-probe's auto fixture before each worker's next test.
		await Promise.all(
			writers.map((writer) => renewProductWriterIfExpiring(store.request, STORE, writer!, source))
		);
		for (const writer of writers) {
			expect(writer!.expiresAt - clock.now()).toBeGreaterThanOrEqual(writerLifeNeeded(180_000));
		}
		// The 180 s tests run while the holder ticks every second.
		for (let second = 0; second < 180; second += 1) {
			clock.advance(HOLDER_TICK_MS);
			await shardHolder.tick();
		}
	}
	expect(store.workerLogins).toEqual([]);
	// A 180 s test needs 240 s of life. Token 1 (~0:00) lives to ~30:00, so the first test start
	// after ~26:00 (~27:10) asks for token 2, living to ~57:10; the first start after ~53:10
	// (~54:10) asks for token 3, which outlives the hour. Store B is never asked for.
	expect(holder.logins).toEqual([STORE, STORE, STORE]);
});

test('(b) the holder never runs two logins at once, across stores and renewal requests', async () => {
	const clock = fakeClock();
	const file = authFile();
	let inFlight = 0;
	let maxInFlight = 0;
	const holder = fakeLogin(clock, async () => {
		inFlight += 1;
		maxInFlight = Math.max(maxInFlight, inFlight);
		// A worker that saw token-1 asks again while OTHER's login is still running.
		if (holder.logins.length === 2)
			requestWriterRenewal(file, STORE, publishedWriterAuthorization(STORE, file));
		await new Promise((resolve) => setTimeout(resolve, 10));
		inFlight -= 1;
	});
	const shardHolder = holderFor(file, clock, holder.login, [STORE, OTHER]);
	requestWriterRenewal(file, STORE, null);
	requestWriterRenewal(file, OTHER, null);
	// The interval fires again while the first tick's logins are still running.
	await Promise.all([shardHolder.tick(), shardHolder.tick()]);
	expect(maxInFlight).toBe(1);
	expect(holder.logins).toEqual([STORE, OTHER, STORE]);
});

test('(c) a reader with less life than its test needs asks the holder and waits instead of logging in', async () => {
	const clock = fakeClock();
	const file = authFile();
	const holder = fakeLogin(clock);
	const shardHolder = holderFor(file, clock, holder.login);
	const store = fakeStore();
	await primed(file, shardHolder);
	clock.advance(WRITER_ACCESS_TOKEN_TTL_MS - writerLifeNeededMs() + 60_000);
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
		await primed(file, shardHolder);
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

test('(f) a fresh token the store refuses twice is not published and backs off; an accepted one is', async () => {
	const clock = fakeClock();
	const file = authFile();
	const holder = fakeLogin(clock);
	const validations: string[] = [];
	const validate = async (_storeUrl: string, authorization: WriterAuthorization) => {
		validations.push(authorization.value);
		return authorization.value !== 'token-2';
	};
	const shardHolder = holderFor(file, clock, holder.login, [STORE], validate);
	await primed(file, shardHolder);
	expect(validations).toEqual(['token-1']);
	const first = publishedWriterAuthorization(STORE, file);
	expect(first?.value).toBe('token-1');

	requestWriterRenewal(file, STORE, first);
	await shardHolder.tick();
	expect(validations).toEqual(['token-1', 'token-2', 'token-2']);
	// Pre-login jitter (7.5 s at random 0.5) for each login, and 3.5 s between the two reads.
	expect(clock.holderSleeps).toEqual([7_500, 7_500, 3_500]);
	expect(publishedWriterAuthorization(STORE, file)).toEqual(first);
	requestWriterRenewal(file, STORE, first);
	await shardHolder.tick();
	expect(holder.logins).toHaveLength(2);
});

for (const [randomValue, jitter] of [
	[0, 0],
	[1, 15_000],
] as const) {
	test(`(g) the holder sleeps ${jitter} ms at random ${randomValue} before it logs in`, async () => {
		const clock = fakeClock(randomValue);
		const file = authFile();
		const sleptBeforeLogin: number[][] = [];
		const holder = fakeLogin(clock, async () => {
			sleptBeforeLogin.push([...clock.holderSleeps]);
		});
		await primed(file, holderFor(file, clock, holder.login));
		expect(sleptBeforeLogin).toEqual([[jitter]]);
	});
}

test('(h) after a failed login the holder does not log in again for 60 s, then does', async () => {
	const clock = fakeClock();
	const file = authFile();
	let refuse = true;
	const holder = fakeLogin(clock, async () => {
		if (refuse) throw new Error('login refused');
	});
	const shardHolder = holderFor(file, clock, holder.login);
	await primed(file, shardHolder);
	expect(publishedWriterAuthorization(STORE, file)).toBeNull();
	refuse = false;
	clock.advance(HOLDER_FAILED_LOGIN_BACKOFF_MS - 1_000);
	await primed(file, shardHolder);
	expect(holder.logins).toHaveLength(1);
	clock.advance(2_000);
	await primed(file, shardHolder);
	expect(holder.logins).toHaveLength(2);
	expect(publishedWriterAuthorization(STORE, file)?.value).toBe('token-2');
});

test('(i) a request naming an older token than the held one causes no login and is dropped', async () => {
	const clock = fakeClock();
	const file = authFile();
	const holder = fakeLogin(clock);
	const shardHolder = holderFor(file, clock, holder.login);
	await primed(file, shardHolder);
	const first = publishedWriterAuthorization(STORE, file);
	requestWriterRenewal(file, STORE, first);
	await shardHolder.tick();
	expect(holder.logins).toHaveLength(2);
	requestWriterRenewal(file, STORE, first);
	await shardHolder.tick();
	expect(holder.logins).toHaveLength(2);
	expect(fs.readdirSync(path.dirname(file))).toEqual(['writer-auth.json']);
});

test('(j) a writer needs its test timeout plus slack, read at call time, capped at TTL minus slack', () => {
	expect(writerLifeNeededMs()).toBe(test.info().timeout + WRITER_LIFE_SLACK_MS);
	test.setTimeout(10 * 60_000);
	expect(writerLifeNeededMs()).toBe(11 * 60_000);
	test.setTimeout(60 * 60_000);
	expect(writerLifeNeededMs()).toBe(WRITER_ACCESS_TOKEN_TTL_MS - WRITER_LIFE_SLACK_MS);
	expect(writerLifeNeeded(undefined)).toBe(WRITER_LIFE_SLACK_MS);
	expect(writerLifeNeeded(0)).toBe(WRITER_RENEW_MARGIN_MS);
});
