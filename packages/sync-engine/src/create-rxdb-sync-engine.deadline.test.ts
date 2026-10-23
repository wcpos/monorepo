import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createAutomaticTickGate } from './automatic-tick-gate';
import { createEngineHarness, type EngineHarness } from './testing';
import { requestStatusOf } from './transport-failure';
import { RequestTimeoutError } from './transport/request-timeout';
import { queueFor } from './write-path/write-intents';

import type { QueryTotalPort } from './maintenance/maintenance-lanes';

setPremiumFlag();
let harness: EngineHarness;
const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const TOTAL_URL = 'https://example.test/wp-json/wc/v3/products?page=1&per_page=1';
/** A server that never answers; the request rejects like a real transport once aborted. */
const blackHole = (init?: RequestInit) =>
	new Promise<Response>((_resolve, reject) => {
		const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
		if (init?.signal?.aborted) abort();
		init?.signal?.addEventListener('abort', abort, { once: true });
	});
/** The host's port as apps/main builds it: one probe through the request the engine hands it. */
const hostProbe: QueryTotalPort['fetchWooQueryTotal'] = async ({ fetcher, signal }) => {
	await fetcher(TOTAL_URL, { signal });
	return 42;
};
beforeEach(async () => {
	fetch.mockReset().mockResolvedValue(new Response('[]'));
	harness = await createEngineHarness({ mode: 'manual', fetch, now: () => Date.now() });
});
afterEach(async () => {
	vi.useRealTimers();
	await harness.dispose();
});

it.each(['headers', 'body'])(
	'releases a lane with black-holed %s so the next run starts',
	async (stage) => {
		fetch.mockImplementation(() =>
			stage === 'headers'
				? new Promise(() => {})
				: Promise.resolve(new Response(new ReadableStream()))
		);
		vi.useFakeTimers();
		const diagnostics = vi.fn();
		const recordTick = vi.fn();
		let failure: unknown;
		const gate = createAutomaticTickGate({
			isGated: () => false,
			connectivity: () => 'online',
			now: () => Date.now(),
			diagnostics,
			onStatusChange: vi.fn(),
			seedRetickLanes: [],
			recordTick,
			tickLane: async (lane) => {
				await harness.engine
					.hostTransport()
					.fetcher('https://example.test/probe')
					.catch((error) => {
						failure = error;
						throw error;
					});
				return { lane, status: 'ran' };
			},
		});
		const first = gate.runLane('existence-prime');
		expect(gate.runLane('existence-prime')).toBe(first);
		await vi.advanceTimersByTimeAsync(59_999);
		expect(failure).toBeUndefined();
		await vi.advanceTimersByTimeAsync(1);
		expect(failure).toBeInstanceOf(RequestTimeoutError);
		await first;
		expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' }));
		expect(harness.diagnostics.at(-1)).toMatchObject({
			type: 'engine.request.deadline',
			fields: { lane: 'host-transport', elapsedMs: 60_000 },
		});
		expect(fetch.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
		fetch.mockResolvedValue(new Response('[]'));
		const second = gate.runLane('existence-prime');
		expect(second).not.toBe(first);
		await second;
		expect(recordTick).toHaveBeenCalledOnce();
	}
);

it('releases a black-holed query-total lane before its lease expires so the next run starts', async () => {
	await harness.dispose();
	let blackHoles = 1;
	fetch.mockImplementation(async (url, init) =>
		url === TOTAL_URL && blackHoles-- > 0 ? blackHole(init) : new Response('[]')
	);
	harness = await createEngineHarness({
		fetch,
		queryTotal: { fetchWooQueryTotal: hostProbe },
		now: () => Date.now(),
	});
	vi.useFakeTimers();
	const recordTick = vi.fn();
	const gate = createAutomaticTickGate({
		isGated: () => false,
		connectivity: () => 'online',
		now: () => Date.now(),
		diagnostics: vi.fn(),
		onStatusChange: vi.fn(),
		seedRetickLanes: [],
		recordTick,
		tickLane: (lane) => harness.engine.sync(lane),
	});
	const first = gate.runLane('query-total-retry');
	expect(gate.runLane('query-total-retry')).toBe(first);
	await vi.advanceTimersByTimeAsync(24_999);
	expect(recordTick).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	expect(recordTick).toHaveBeenCalledOnce();
	expect(fetch.mock.calls.find(([url]) => url === TOTAL_URL)?.[1]?.signal?.aborted).toBe(true);
	expect(harness.diagnostics).toContainEqual(
		expect.objectContaining({
			type: 'engine.request.deadline',
			fields: { lane: 'query-total-retry', elapsedMs: 25_000, consecutiveDeadlines: 1 },
		})
	);
	const second = gate.runLane('query-total-retry');
	expect(second).not.toBe(first);
	await second;
	expect(recordTick).toHaveBeenCalledTimes(2);
});

it.each(['headers', 'body'])('counts black-holed %s once in server pressure', async (stage) => {
	const rejectTransport: ((error: Error) => void)[] = [];
	fetch.mockImplementation(() =>
		stage === 'headers'
			? new Promise((_, reject) => rejectTransport.push(reject))
			: Promise.resolve(
					new Response(
						new ReadableStream({
							start: (controller) => rejectTransport.push((error) => controller.error(error)),
						})
					)
				)
	);
	vi.useFakeTimers();
	const requests = Array.from({ length: 3 }, () =>
		harness.engine
			.hostTransport()
			.fetcher('https://example.test/probe')
			.catch((error) => error)
	);
	await vi.advanceTimersByTimeAsync(60_000);
	expect(await Promise.all(requests)).toEqual(Array(3).fill(expect.any(RequestTimeoutError)));
	expect(harness.engine.status().serverPressure).toMatchObject({
		multiplier: 2,
		signal: 'timeout',
	});
	for (const reject of rejectTransport)
		reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
	await vi.advanceTimersByTimeAsync(0);
	expect(harness.engine.status().serverPressure.multiplier).toBe(2);
});

it('counts a black-holed query-total probe exactly once in server pressure', async () => {
	// The host's probe runs on the request the engine hands it, so the probe's deadline
	// is its one layer: the raw fetch's abort, long past the abort-as-timeout age, is
	// the same request and must not strike a second time.
	await harness.dispose();
	let networkDown = false;
	let blackHoles = 1;
	fetch.mockImplementation(async (url, init) => {
		if (url === TOTAL_URL) return blackHoles-- > 0 ? blackHole(init) : new Response('[]');
		if (networkDown) throw new Error('network down');
		return new Response('[]');
	});
	harness = await createEngineHarness({
		fetch,
		queryTotal: { fetchWooQueryTotal: hostProbe },
		now: () => Date.now(),
	});
	vi.useFakeTimers();
	networkDown = true;
	const networkFailure = () =>
		harness.engine
			.hostTransport()
			.fetcher('https://example.test/probe')
			.catch(() => {});
	await networkFailure();
	const run = harness.engine.sync('query-total-retry');
	await vi.advanceTimersByTimeAsync(25_000);
	await run;
	expect(harness.diagnostics).toContainEqual(
		expect.objectContaining({
			type: 'engine.request.deadline',
			fields: { lane: 'query-total-retry', elapsedMs: 25_000, consecutiveDeadlines: 1 },
		})
	);
	// Two strikes (the failure and the probe): one short of a back-off.
	expect(harness.engine.status().serverPressure.multiplier).toBe(1);
	await networkFailure();
	expect(harness.engine.status().serverPressure).toMatchObject({
		multiplier: 2,
		signal: 'timeout',
	});
});

it('settles caller cancellation immediately without deadline or pressure for ignored aborts', async () => {
	fetch.mockImplementation(() => new Promise(() => {}));
	vi.useFakeTimers();
	const caller = new AbortController();
	const settled = vi.fn();
	const requests = Array.from({ length: 3 }, () =>
		harness.engine
			.hostTransport()
			.fetcher('https://example.test/probe', { signal: caller.signal })
			.catch(settled)
	);
	await vi.advanceTimersByTimeAsync(1_000);
	caller.abort();
	await vi.advanceTimersByTimeAsync(0);
	expect(settled).toHaveBeenCalledTimes(3);
	expect(settled).toHaveBeenCalledWith(expect.objectContaining({ name: 'AbortError' }));
	await Promise.all(requests);
	await vi.advanceTimersByTimeAsync(60_000);
	expect(harness.diagnostics.some((event) => event.type === 'engine.request.deadline')).toBe(false);
	expect(harness.engine.status().serverPressure.multiplier).toBe(1);
});

it('numbers consecutive deadlines per lane and restarts after any answer', async () => {
	vi.useFakeTimers();
	const { fetcher } = harness.engine.hostTransport();
	const blackHole = () => {
		fetch.mockReturnValueOnce(new Promise(() => {}));
		const request = fetcher('https://example.test/probe').catch(() => {});
		return vi.advanceTimersByTimeAsync(60_000).then(() => request);
	};
	await blackHole();
	await blackHole();
	await blackHole();
	fetch.mockResolvedValueOnce(new Response('[]', { status: 503 }));
	await fetcher('https://example.test/probe');
	await blackHole();

	expect(
		harness.diagnostics
			.filter((event) => event.type === 'engine.request.deadline')
			.map((event) => event.fields?.consecutiveDeadlines)
	).toEqual([1, 2, 3, 1]);
});

it('leaves a thrown failure unmarked unless the host wrote its transport row', async () => {
	// The engine's wrapper also sees rejections no transport row reported (a body
	// stream that broke after a 200); only the host, at the line that writes the
	// row, may mark an error as already reported.
	const broken = new TypeError('body stream failed');
	fetch.mockRejectedValueOnce(broken);
	const { fetcher } = harness.engine.hostTransport();

	await expect(fetcher('https://example.test/probe')).rejects.toBe(broken);

	expect(requestStatusOf(broken)).toBeUndefined();
});

it('starts the deadline streak over under another store scope', async () => {
	// The census count is the one deadline lane a scope switch never answers on,
	// so only the scope change itself can start the streak over here.
	fetch.mockImplementation(async (url, init) =>
		url === TOTAL_URL ? blackHole(init) : new Response('[]')
	);
	const census = await createEngineHarness({
		mode: 'manual',
		fetch,
		queryTotal: { fetchWooQueryTotal: hostProbe },
	});
	vi.useFakeTimers();
	try {
		const blackHole = async () => {
			const check = census.engine.checkCollection('products');
			await vi.advanceTimersByTimeAsync(25_000);
			await check;
		};
		await blackHole();
		await blackHole();
		vi.useRealTimers();
		await census.engine.scope.switch({
			site: 'https://engine-harness.example.test',
			storeId: 2,
			cashierId: 'deadline-streak-other-store',
		});
		vi.useFakeTimers();
		await blackHole();

		// Store A's two deadlines must not make store B's first read as its third.
		expect(
			census.diagnostics
				.filter(
					(event) =>
						event.type === 'engine.request.deadline' && event.fields?.lane === 'query-total-retry'
				)
				.map((event) => (event.fields as { consecutiveDeadlines?: number }).consecutiveDeadlines)
		).toEqual([1, 2, 1]);
	} finally {
		vi.useRealTimers();
		await census.dispose();
	}
});

it("keeps a timing-out path's streak when a healthy probe answers on the same lane", async () => {
	vi.useFakeTimers();
	const { fetcher } = harness.engine.hostTransport();
	const probe = async () => {
		fetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		await fetcher('https://example.test/probe/tick');
	};
	const timeout = async () => {
		fetch.mockReturnValueOnce(new Promise(() => {}));
		const request = fetcher('https://example.test/probe/sequence-log?since=4').catch(() => {});
		await vi.advanceTimersByTimeAsync(60_000);
		await request;
	};
	for (let cycle = 0; cycle < 3; cycle += 1) {
		await probe();
		await timeout();
	}

	// The probe's answers are another path's: the sequence-log streak reaches 3.
	expect(
		harness.diagnostics
			.filter((event) => event.type === 'engine.request.deadline')
			.map((event) => (event.fields as { consecutiveDeadlines?: number }).consecutiveDeadlines)
	).toEqual([1, 2, 3]);
});

it('a black-holed push meets the drain deadline once, in the write-drain lane', async () => {
	const uuid = '22222222-2222-4222-8222-222222222222';
	fetch.mockImplementation((url) =>
		url.includes('/push/') ? new Promise(() => {}) : Promise.resolve(new Response('[]'))
	);
	const scope = harness.engine.active();
	if (!scope) throw new Error('no active scope');
	await (scope.database.collections.orders as { insert(doc: unknown): Promise<unknown> }).insert({
		posUserId: '',
		posStoreId: '',
		uuid,
		remoteId: null,
		remoteKey: '',
		number: '',
		dateCreatedGmt: '2026-07-10T00:00:00',
		status: 'pending',
		total: '0.00',
		customerId: 0,
		payload: { status: 'pos-open', meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid }] },
		sync: { revision: '', partial: false, source: 'skeleton' },
		local: { dirty: false, pendingMutationIds: [] },
	});
	await harness.engine.write({
		collection: 'orders',
		operation: 'create',
		recordId: uuid,
		payload: { status: 'pos-open', meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid }] },
	});
	vi.useFakeTimers();

	const drain = harness.engine.sync('write-drain');
	await vi.advanceTimersByTimeAsync(29_999);
	expect(harness.diagnostics.some((event) => event.type === 'push.error')).toBe(false);
	await vi.advanceTimersByTimeAsync(1);
	expect(await drain).toMatchObject({ status: 'ran', pushed: 0 });

	// One deadline layer: the drain's own 30 s is the row, not a silent outer abort.
	expect(harness.diagnostics.filter((event) => event.type === 'engine.request.deadline')).toEqual([
		expect.objectContaining({
			fields: { lane: 'write-drain', elapsedMs: 30_000, consecutiveDeadlines: 1 },
		}),
	]);
	expect(harness.diagnostics.filter((event) => event.type === 'push.error')).toEqual([
		expect.objectContaining({
			fields: expect.objectContaining({ reason: 'TimeoutError', phase: 'transport' }),
		}),
	]);
});

it('a black-holed conflict-resolution fetch is labelled conflict-resolution at 60 s', async () => {
	fetch.mockImplementation((url) =>
		url.includes('/products?include=42')
			? new Promise(() => {})
			: Promise.resolve(new Response('[]'))
	);
	const scope = harness.engine.active();
	if (!scope) throw new Error('no active scope');
	const queue = queueFor(scope.database);
	const refused = await queue.enqueue({
		mutationId: 'refused-product-update',
		collectionName: 'products',
		operation: 'update',
		recordId: 'product-uuid-1',
		origin: 'existing',
		payload: { id: 42, name: 'local edit' },
		baseRevision: 'sha256:server-r1',
		queuedAt: '2026-01-05T00:00:00.000Z',
	});
	await queue.replace({ ...refused, status: 'rejected', rejectedStatus: 400 });
	vi.useFakeTimers();

	const discard = harness.engine
		.resolveConflict('refused-product-update', 'discard')
		.catch((error: unknown) => error);
	await vi.advanceTimersByTimeAsync(60_000);

	expect(await discard).toBeInstanceOf(RequestTimeoutError);
	expect(harness.diagnostics.filter((event) => event.type === 'engine.request.deadline')).toEqual([
		expect.objectContaining({
			fields: { lane: 'conflict-resolution', elapsedMs: 60_000, consecutiveDeadlines: 1 },
		}),
	]);
});

it('a black-holed maintenance-lane fetch is labelled with its own lane', async () => {
	expect((await harness.engine.sync('order-window-seed')).status).toBe('ran');
	fetch.mockImplementation(() => new Promise(() => {}));
	vi.useFakeTimers();

	let settled = false;
	const run = harness.engine.sync('scheduler-drain').finally(() => (settled = true));
	// The drain walks its tasks one after another; each black-holed pull takes the full deadline.
	for (let step = 0; step < 10 && !settled; step += 1) await vi.advanceTimersByTimeAsync(60_000);
	await run;

	expect(
		harness.diagnostics
			.filter((event) => event.type === 'engine.request.deadline')
			.map((event) => event.fields)
	).toContainEqual({ lane: 'scheduler-drain', elapsedMs: 60_000, consecutiveDeadlines: 1 });
	expect(
		harness.diagnostics.some(
			(event) => event.type === 'engine.request.deadline' && event.fields?.lane === 'host-transport'
		)
	).toBe(false);
});
