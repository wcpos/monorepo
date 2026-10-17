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
