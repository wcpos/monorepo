import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createAutomaticTickGate } from './automatic-tick-gate';
import { createEngineHarness, type EngineHarness } from './testing';
import { requestStatusOf } from './transport-failure';
import { RequestTimeoutError } from './write-path/request-timeout';

setPremiumFlag();
let harness: EngineHarness;
const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
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

it('releases a black-holed query-total lane and counts its deadline as pressure exactly once', async () => {
	await harness.dispose();
	const fetchWooQueryTotal = vi.fn().mockResolvedValue(7);
	harness = await createEngineHarness({
		mode: 'manual',
		queryTotal: { fetchWooQueryTotal },
		now: () => Date.now(),
		fetch,
	});
	let rejectLate!: (error: Error) => void;
	const pending = new Promise<number>((_, reject) => {
		rejectLate = reject;
	});
	fetchWooQueryTotal.mockReturnValueOnce(pending);
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
	await vi.advanceTimersByTimeAsync(0);
	expect(gate.runLane('query-total-retry')).toBe(first);
	await vi.advanceTimersByTimeAsync(25_000);
	expect(fetchWooQueryTotal.mock.calls[0][0].signal.aborted).toBe(true);
	await first;
	expect(harness.diagnostics).toContainEqual(
		expect.objectContaining({
			type: 'engine.request.deadline',
			fields: { lane: 'query-total-retry', elapsedMs: 25_000, consecutiveDeadlines: 1 },
		})
	);
	fetch.mockRejectedValue(new Error('offline'));
	const { fetcher } = harness.engine.hostTransport();
	const failTransport = () => fetcher('https://example.test/probe').catch(() => {});
	await failTransport();
	await failTransport();
	expect(harness.engine.status().serverPressure).toMatchObject({
		multiplier: 2,
		signal: 'timeout',
	});
	rejectLate(Object.assign(new Error('late abort'), { name: 'AbortError' }));
	await vi.advanceTimersByTimeAsync(0);
	await failTransport();
	await failTransport();
	expect(harness.engine.status().serverPressure.multiplier).toBe(2);
	const second = gate.runLane('query-total-retry');
	expect(second).not.toBe(first);
	await second;
	expect(recordTick).toHaveBeenCalledTimes(2);
});

it('counts black-holed deadlines as pressure once even when abort rejects later', async () => {
	let rejectLate!: (error: Error) => void;
	const pending = new Promise<Response>((_, reject) => {
		rejectLate = reject;
	});
	fetch.mockReturnValue(pending);
	vi.useFakeTimers();
	const { fetcher } = harness.engine.hostTransport();
	const requests = Promise.all(
		Array.from({ length: 3 }, () => fetcher('https://example.test/probe').catch((error) => error))
	);
	await vi.advanceTimersByTimeAsync(60_000);
	expect(await requests).toEqual(Array(3).fill(expect.any(RequestTimeoutError)));
	expect(harness.engine.status().serverPressure).toMatchObject({
		multiplier: 2,
		signal: 'timeout',
	});
	rejectLate(Object.assign(new Error('late abort'), { name: 'AbortError' }));
	await vi.advanceTimersByTimeAsync(0);
	expect(harness.engine.status().serverPressure.multiplier).toBe(2);
});

it('settles caller cancellation immediately without deadline events or pressure', async () => {
	let rejectLate!: (error: Error) => void;
	fetch.mockReturnValue(
		new Promise((_, reject) => {
			rejectLate = reject;
		})
	);
	vi.useFakeTimers();
	const caller = new AbortController();
	const settled = vi.fn();
	const { fetcher } = harness.engine.hostTransport();
	const requests = Promise.all(
		Array.from({ length: 3 }, () =>
			fetcher('https://example.test/probe', { signal: caller.signal }).catch(settled)
		)
	);
	await vi.advanceTimersByTimeAsync(1_000);
	caller.abort();
	await vi.advanceTimersByTimeAsync(0);
	expect(settled).toHaveBeenCalledTimes(3);
	expect(settled).toHaveBeenCalledWith(expect.objectContaining({ name: 'AbortError' }));
	await requests;
	await vi.advanceTimersByTimeAsync(60_000);
	rejectLate(Object.assign(new Error('late abort'), { name: 'AbortError' }));
	await vi.advanceTimersByTimeAsync(0);
	expect(harness.diagnostics.some((e) => e.type === 'engine.request.deadline')).toBe(false);
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
	const census = await createEngineHarness({
		mode: 'manual',
		queryTotal: { fetchWooQueryTotal: () => new Promise(() => {}) },
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
