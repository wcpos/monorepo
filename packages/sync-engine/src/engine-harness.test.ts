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

		await harness.seed('engineKv', [{ id: 'fixture', value: 'seeded' }]);
		expect((await harness.collection('engineKv').findOne('fixture').exec())?.get('value')).toBe(
			'seeded'
		);

		const response = await harness.engine
			.hostTransport()
			.fetcher('https://shop.example.test/probe');
		expect(await response.json()).toEqual({ ok: true });
		expect(harness.requests).toEqual([expect.objectContaining({ method: 'GET', path: '/probe' })]);

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
