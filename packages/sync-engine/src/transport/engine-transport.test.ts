import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncEvent } from '@wcpos/sync-core';

import { createServerPressureMonitor } from '../change-signal/server-pressure';
import { systemTimers } from '../engine-timers';
import { RequestTimeoutError } from './request-timeout';
import { createEngineTransport } from './engine-transport';

const URL_PROBE = 'https://store.test/wp-json/wcpos/v2/probe';
const abortError = () => Object.assign(new Error('request aborted'), { name: 'AbortError' });
/** A raw fetch that never answers and rejects like a real transport when aborted. */
const neverAnswers = (_url: string, init?: RequestInit) =>
	new Promise<Response>((_resolve, reject) => {
		if (init?.signal?.aborted) reject(abortError());
		init?.signal?.addEventListener('abort', () => reject(abortError()), { once: true });
	});
const refusalBody = {
	code: 'wcpos_update_required',
	data: { min_protocol: 3, server_protocol: 3, plugin_version: '2.0.0' },
};

function transportWith(overrides: Partial<Parameters<typeof createEngineTransport>[0]> = {}) {
	const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
		async () => new Response('[]')
	);
	const diagnostics: SyncEvent[] = [];
	const onUpdateRequired = vi.fn();
	const pressure = createServerPressureMonitor();
	const observe = vi.spyOn(pressure, 'observe');
	const transport = createEngineTransport({
		fetcher,
		pressure,
		onUpdateRequired,
		diagnostics: (event) => void diagnostics.push(event),
		now: () => Date.now(),
		// Fake timers drive the global timers that systemTimers delegates to.
		timers: systemTimers,
		connectivity: () => 'online',
		onPressureTransition: vi.fn(),
		onPressureReadoutChanged: vi.fn(),
		...overrides,
	});
	const deadlines = () =>
		diagnostics
			.filter((event) => event.type === 'engine.request.deadline')
			.map((event) => event.fields);
	return { transport, fetcher, diagnostics, onUpdateRequired, observe, deadlines };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createEngineTransport', () => {
	it('latches on the update-required refusal: one notice for concurrent refusals, then local replays', async () => {
		const { transport, fetcher, onUpdateRequired } = transportWith();
		fetcher.mockImplementation(
			async () => new Response(JSON.stringify(refusalBody), { status: 426 })
		);

		const answers = await Promise.all([
			transport.request(URL_PROBE),
			transport.request(`${URL_PROBE}/other`),
		]);
		expect(answers.map((answer) => answer.status)).toEqual([426, 426]);
		expect(onUpdateRequired).toHaveBeenCalledOnce();
		expect(onUpdateRequired).toHaveBeenCalledWith({
			minProtocol: 3,
			serverProtocol: 3,
			pluginVersion: '2.0.0',
			status: 426,
		});

		const replay = await transport.request(URL_PROBE);
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(replay.status).toBe(426);
		expect(await replay.json()).toEqual(refusalBody);
	});

	it.each([
		{ instance: 'install-1', sent: 'install-1' },
		{ instance: undefined, sent: null },
	])(
		'owns the instance header: instance $instance is sent as $sent',
		async ({ instance, sent }) => {
			const { transport, fetcher } = transportWith({ getInstanceId: async () => instance });

			await transport.request(URL_PROBE, {
				headers: { 'X-WCPOS-Instance': 'caller-spelling', Accept: 'application/json' },
			});

			const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
			expect(headers.get('X-WCPOS-Instance')).toBe(sent);
			expect(headers.get('Accept')).toBe('application/json');
		}
	);

	it.each([
		{ abortAfterMs: 5_000, observations: [] },
		{ abortAfterMs: 15_000, observations: [0] },
	])(
		'an abort after $abortAfterMs ms is observed as $observations',
		async ({ abortAfterMs, observations }) => {
			const { transport, fetcher, observe, deadlines } = transportWith();
			fetcher.mockImplementation(neverAnswers);
			const caller = new AbortController();
			const request = transport.request(URL_PROBE, { signal: caller.signal }).catch((e) => e);

			await vi.advanceTimersByTimeAsync(abortAfterMs);
			caller.abort();

			expect(await request).toHaveProperty('name', 'AbortError');
			expect(observe.mock.calls.map(([observation]) => observation.status)).toEqual(observations);
			expect(deadlines()).toEqual([]);
		}
	);

	it.each([
		{ header: undefined, body: 30, retryAfter: '30' },
		{ header: 'soon', body: 30, retryAfter: '30' },
		{ header: '5', body: 30, retryAfter: '5' },
	])(
		'reads Retry-After from the body only when the header is missing or unparseable ($header)',
		async ({ header, body, retryAfter }) => {
			const { transport, fetcher, observe } = transportWith();
			fetcher.mockResolvedValue(
				new Response(JSON.stringify({ code: 'busy', data: { retry_after_seconds: body } }), {
					status: 429,
					headers: header === undefined ? {} : { 'Retry-After': header },
				})
			);

			await transport.request(URL_PROBE);

			expect(observe).toHaveBeenCalledOnce();
			expect(observe.mock.calls[0][0]).toMatchObject({ status: 429, retryAfter });
		}
	);

	it('a lane deadline override is the one deadline layer', async () => {
		const { transport, fetcher, observe, deadlines } = transportWith();
		fetcher.mockImplementation(neverAnswers);
		const request = transport
			.request(URL_PROBE, undefined, { lane: 'write-drain', deadlineMs: 30_000 })
			.catch((e) => e);

		await vi.advanceTimersByTimeAsync(29_999);
		expect(deadlines()).toEqual([]);
		await vi.advanceTimersByTimeAsync(1);

		expect(await request).toBeInstanceOf(RequestTimeoutError);
		expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
		expect(deadlines()).toEqual([
			{ lane: 'write-drain', elapsedMs: 30_000, consecutiveDeadlines: 1 },
		]);
		expect(observe.mock.calls.map(([observation]) => observation.status)).toEqual([0]);
		// No second, default-length layer is left running behind it.
		expect(vi.getTimerCount()).toBe(0);
	});

	it('counts deadline streaks per lane and path, ends one on any answer, and restarts them per scope', async () => {
		const { transport, fetcher, deadlines } = transportWith();
		const blackHole = async (url: string, lane?: 'require') => {
			fetcher.mockImplementationOnce(neverAnswers);
			const request = transport
				.request(url, undefined, lane === undefined ? undefined : { lane })
				.catch(() => undefined);
			await vi.advanceTimersByTimeAsync(60_000);
			await request;
		};

		await blackHole(`${URL_PROBE}?page=1`);
		await blackHole(`${URL_PROBE}?page=2`);
		await blackHole(URL_PROBE, 'require');
		await blackHole(`${URL_PROBE}/elsewhere`);
		fetcher.mockResolvedValueOnce(new Response('[]', { status: 503 }));
		await transport.request(URL_PROBE);
		await blackHole(URL_PROBE);
		await blackHole(URL_PROBE, 'require');
		transport.scopeActivated();
		await blackHole(URL_PROBE, 'require');

		expect(deadlines().map((row) => [row?.lane, row?.consecutiveDeadlines])).toEqual([
			['host-transport', 1],
			['host-transport', 2],
			['require', 1],
			['host-transport', 1],
			['host-transport', 1],
			['require', 2],
			['require', 1],
		]);
	});

	it('reports the latch once set, for the query-total port to answer null without a request', async () => {
		const { transport, fetcher } = transportWith();

		await transport.request(URL_PROBE);
		expect(transport.updateRequired()).toBe(false);
		fetcher.mockResolvedValue(new Response(JSON.stringify(refusalBody), { status: 426 }));
		await transport.request(URL_PROBE);

		expect(transport.updateRequired()).toBe(true);
	});
});
