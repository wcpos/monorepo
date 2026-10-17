import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createAutomaticTickGate } from './automatic-tick-gate';
import { createEngineHarness, type EngineHarness } from './testing';
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

it('releases a black-holed query-total lane before its lease expires so the next run starts', async () => {
	await harness.dispose();
	const fetchWooQueryTotal = vi.fn(async (_input: { signal?: AbortSignal }) => 42);
	fetchWooQueryTotal.mockImplementationOnce(() => new Promise(() => {}));
	harness = await createEngineHarness({
		queryTotal: { fetchWooQueryTotal },
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
	expect(fetchWooQueryTotal.mock.calls[0][0].signal?.aborted).toBe(true);
	expect(harness.diagnostics).toContainEqual(
		expect.objectContaining({
			type: 'engine.request.deadline',
			fields: { lane: 'query-total-retry', elapsedMs: 25_000 },
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
	await harness.dispose();
	let rejectProbe!: (error: Error) => void;
	harness = await createEngineHarness({
		fetch,
		queryTotal: {
			fetchWooQueryTotal: vi
				.fn(async () => 42)
				.mockImplementationOnce(
					() =>
						new Promise((_, reject) => {
							rejectProbe = reject;
						})
				),
		},
		now: () => Date.now(),
	});
	vi.useFakeTimers();
	const run = harness.engine.sync('query-total-retry');
	await vi.advanceTimersByTimeAsync(24_999);
	fetch.mockRejectedValue(new Error('network down'));
	const networkFailure = () =>
		harness.engine
			.hostTransport()
			.fetcher('https://example.test/probe')
			.catch(() => {});
	await networkFailure();
	await networkFailure();
	expect(harness.engine.status().serverPressure.multiplier).toBe(1);
	await vi.advanceTimersByTimeAsync(1);
	await run;
	expect(harness.engine.status().serverPressure).toMatchObject({
		multiplier: 2,
		signal: 'timeout',
	});
	rejectProbe(Object.assign(new Error('aborted'), { name: 'AbortError' }));
	await vi.advanceTimersByTimeAsync(0);
	await networkFailure();
	await networkFailure();
	expect(harness.engine.status().serverPressure.multiplier).toBe(2);
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
