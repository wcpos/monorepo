import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness, memoryEngineStorage } from './testing';

import type { CapturedEngineTimers, EngineHarness, EngineHarnessOptions } from './testing';

setPremiumFlag();

afterEach(createEngineHarness.disposeTrackedEngines);

describe('createEngineHarness', () => {
	it('drives the published harness surface through the real engine', async () => {
		const harness: EngineHarness = await createEngineHarness({
			site: 'https://shop.example.test',
			routes: { '/probe': { ok: true } },
			captureTimers: true,
		} satisfies EngineHarnessOptions);
		const timers: CapturedEngineTimers = harness.timers!;

		expect(harness.engine.active()?.identity).toEqual(harness.identity);
		expect(harness.site.syncBaseUrl).toBe('https://shop.example.test/wp-json/wcpos/v2');
		expect(timers.timeouts).toEqual([]);
		expect(timers.intervals).toEqual([]);

		harness.clock.set(2_000);
		harness.clock.advance(250);
		expect(harness.clock.now()).toBe(2_250);
		harness.connectivity.set('offline');
		expect(harness.engine.status().connectivity).toBe('offline');
		harness.connectivity.set('online');

		await harness.seed('engineKv', [{ key: 'fixture', value: 'seeded' }]);
		expect((await harness.collection('engineKv').findOne('fixture').exec())?.get('value')).toBe(
			'seeded'
		);

		const response = await harness.engine
			.hostTransport()
			.fetcher('https://shop.example.test/probe');
		expect(await response.json()).toEqual({ ok: true });
		expect(harness.requests.filter(({ path }) => path === '/probe')).toEqual([
			expect.objectContaining({ method: 'GET', path: '/probe' }),
		]);
		expect(harness.requests.map(({ path }) => path)).toEqual(
			expect.arrayContaining([
				'/wp-json/wcpos/v2/changes/sequence-log',
				'/wp-json/wcpos/v2/changes/config-fingerprint',
			])
		);

		await harness.engine.sync('write-drain');
		expect(harness.events).toEqual(
			expect.arrayContaining([
				{ type: 'lane-start', lane: 'write-drain' },
				expect.objectContaining({ type: 'lane-finish', lane: 'write-drain' }),
			])
		);

		await harness[Symbol.asyncDispose]();
		expect(harness.ofType('engine.disposed')).toEqual([
			expect.objectContaining({ type: 'engine.disposed', level: 'info' }),
		]);
		expect(harness.diagnostics).toEqual(
			expect.arrayContaining([expect.objectContaining({ type: 'engine.disposed' })])
		);
	});

	it('answers startup protocol without invoking the scenario fetch', async () => {
		const fetch = vi.fn(async () => {
			throw new Error('unexpected scenario fetch');
		});
		const harness = createEngineHarness({ mode: 'manual', fetch, awaitReady: false });
		await harness.engine.ready;
		expect(fetch).not.toHaveBeenCalled();
		expect(
			harness.requests.filter(({ path }) => path.endsWith('/changes/config-fingerprint'))
		).toHaveLength(1);
		const primes = harness.requests.filter(({ path }) => path.endsWith('/changes/sequence-log'));
		expect(primes).toHaveLength(1);
		expect(new URL(primes[0].url).searchParams.get('since')).toBe('0');
		expect(new URL(primes[0].url).searchParams.get('limit')).toBe('1');
	});

	it('explicit routes override protocol defaults', async () => {
		const journal = vi.fn(() => Response.json({ checkpoint: { head: 37 } }));
		const fingerprint = vi.fn(() =>
			Response.json({
				fingerprints: {},
				barcode_fields: { products: ['sku'], variations: ['global_unique_id'] },
			})
		);
		const harness = await createEngineHarness({
			routes: {
				'/changes/sequence-log': journal,
				'/changes/config-fingerprint': fingerprint,
			},
		});
		expect(journal).toHaveBeenCalledOnce();
		expect(fingerprint).toHaveBeenCalledOnce();
		expect(harness.engine.active()?.barcodeSelectors).toEqual({
			products: ['sku'],
			variations: ['global_unique_id'],
		});
	});

	it('answers an empty journal at the supplied cursor', async () => {
		const fetch = vi.fn(async () => Response.json({ unexpected: true }));
		const harness = await createEngineHarness({ fetch });
		const response = await harness.engine
			.hostTransport()
			.fetcher(`${harness.site.syncBaseUrl}/changes/sequence-log?since=42&limit=10`);
		expect(await response.json()).toEqual({
			changes: [],
			checkpoint: { since: 42, head: 42 },
			complete: true,
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('keeps lightweight tick and range defaults out of scenario fetch', async () => {
		const fetch = vi.fn(async () => Response.json({ unexpected: true }));
		const harness = await createEngineHarness({ fetch });
		const before = harness.requests.length;
		const tick = await harness.engine
			.hostTransport()
			.fetcher(`${harness.site.syncBaseUrl}/changes/tick`);
		const range = await harness.engine
			.hostTransport()
			.fetcher(`${harness.site.syncBaseUrl}/changes/range-checksum`);
		expect(await tick.json()).toEqual({});
		expect(await range.json()).toEqual({ changes: [], complete: true });
		expect(harness.requests.slice(before).map(({ path }) => path)).toEqual([
			'/wp-json/wcpos/v2/changes/tick',
			'/wp-json/wcpos/v2/changes/range-checksum',
		]);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('delegates unknown traffic with unchanged arguments', async () => {
		const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ ok: true }));
		const harness = await createEngineHarness({ fetch });
		const probe = `${harness.site.syncBaseUrl}/probe`;
		const post = `${harness.site.syncBaseUrl}/changes/config-fingerprint`;
		const init = { method: 'POST', body: '{}' };
		await harness.engine.hostTransport().fetcher(probe);
		await harness.engine.hostTransport().fetcher(post, init);
		expect(fetch.mock.calls).toEqual([
			[probe, undefined],
			[post, init],
		]);
		expect(fetch.mock.calls[1][1]).toBe(init);
	});

	it('records selected-handler failures without falling through', async () => {
		const failure = new Error('tick unavailable');
		const fetch = vi.fn(async () => Response.json({ unexpected: true }));
		const harness = await createEngineHarness({
			fetch,
			routes: {
				'/changes/tick': () => {
					throw failure;
				},
			},
		});
		const before = harness.requests.length;
		await expect(
			harness.engine.hostTransport().fetcher(`${harness.site.syncBaseUrl}/changes/tick`)
		).rejects.toBe(failure);
		expect(harness.requests.slice(before)).toEqual([
			expect.objectContaining({ method: 'GET', path: '/wp-json/wcpos/v2/changes/tick' }),
		]);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('records scripted responses and preserves script precedence', async () => {
		const tick = vi.fn(() => Response.json({ head: 1 }));
		const harness = await createEngineHarness({ routes: { '/changes/tick': tick } });
		const before = harness.requests.length;
		await harness.respond(Response.json({}));
		expect(tick).not.toHaveBeenCalled();
		expect(harness.requests.slice(before)).toEqual([
			expect.objectContaining({ method: 'GET', path: '/wp-json/wcpos/v2/changes/tick' }),
		]);
	});

	it("responds through the engine's wrapped fetcher and advances its clock", async () => {
		const harness = await createEngineHarness({
			mode: 'auto',
			captureTimers: true,
			startAtMs: 1_000,
		});
		harness.diagnostics.length = 0;

		await harness.respond(new Response(null, { status: 429 }), { elapsedMs: 250 });

		expect(harness.clock.now()).toBe(1_250);
		expect(harness.ofType('cadence.backoff')).toHaveLength(1);
		await harness.dispose();
	});

	it('names collection access without an active scope', async () => {
		const harness = createEngineHarness({ awaitReady: false });
		expect(() => harness.collection('products')).toThrow(
			'Engine harness has no active scope; cannot access collection "products"'
		);
		await harness.dispose();
	});

	it('filters undefined port values before applying pass-through ports', async () => {
		const harness = await createEngineHarness({
			ports: {
				now: undefined,
				diagnostics: undefined,
				connectivity: undefined,
				fetcher: undefined,
				storage: undefined,
			},
		});
		expect(harness.engine.active()).not.toBeNull();
		await harness.dispose();
	});

	it('rejects pass-through overrides of harness-owned ports', () => {
		expect(() => createEngineHarness({ awaitReady: false, ports: { now: () => 42 } })).toThrow(
			/options\.ports cannot override harness-owned ports \(now, diagnostics, connectivity, fetcher; storage when storage or validateSchemas is set\): now/
		);

		expect(() =>
			createEngineHarness({
				awaitReady: false,
				storage: memoryEngineStorage(),
				ports: { storage: memoryEngineStorage() },
			})
		).toThrow(/harness-owned ports.*: storage/);
	});

	it('untracks an engine disposed through its public handle', async () => {
		const harness = await createEngineHarness();
		const status = vi.spyOn(harness.engine, 'status');
		await harness.engine.dispose();
		const callsAfterDispose = status.mock.calls.length;

		await createEngineHarness.disposeTrackedEngines();

		expect(status).toHaveBeenCalledTimes(callsAfterDispose);
	});
});
