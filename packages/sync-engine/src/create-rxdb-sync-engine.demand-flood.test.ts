/**
 * The demand-path flood detector wired through the PUBLIC engine handle
 * (#1134 item 2, owner ruling 2026-08-14): the demand path stays uncapped —
 * every request a flood declares still executes, none is delayed, queued, or
 * dropped — and a sustained flood raises exactly one durable
 * `demand.flood-detected` event per breach episode, at the REAL derived
 * constants (no test-sized thresholds here: this spec is the proof that
 * 300+/min for 3 consecutive minutes alarms and that nothing below it does).
 *
 * The detector's episode state machine is pinned in
 * demand-flood-detector.test.ts; this spec pins the seam: counting happens
 * where demand requests execute, and it is provably passive.
 */

import { remoteId } from './testing';
import { describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import type { StoreScopeIdentity } from '@wcpos/sync-core';

import { DEMAND_FLOOD_REQUESTS_PER_TICK, DEMAND_FLOOD_TICK_MS } from './demand-flood-detector';
import { createEngineHarness } from './testing';

import type { EngineHarness } from './engine-harness';

setPremiumFlag();

const SITE = 'https://flood.example.test';
let nextIdentity = 0;

function identity(): StoreScopeIdentity {
	nextIdentity += 1;
	return { site: SITE, storeId: 1, cashierId: `flood-${nextIdentity}` };
}

function json(body: unknown, headers?: Record<string, string>): Response {
	return Response.json(body, { headers });
}

function floodHarness(): Promise<EngineHarness> {
	return createEngineHarness({
		site: SITE,
		identity: identity(),
		mode: 'manual',
		fetch: async (url) => {
			const path = new URL(url).pathname;
			if (path.endsWith('/changes/config-fingerprint')) {
				return json({
					fingerprints: { products: 'fp-1', variations: 'fp-1', tax_rates: 'fp-1' },
					barcode_fields: { products: ['sku'], variations: ['sku'], tax_rates: [] },
				});
			}
			// Targeted pulls: the ids stay absent server-side, so every re-require
			// re-fetches — exactly the runaway refetch-churn shape (#888 class).
			return json([], { 'X-WP-TotalPages': '1', 'X-WP-Total': '0' });
		},
	});
}

describe('demand-path flood detector through the public handle', () => {
	it(
		'raises one durable event per sustained flood while every request still executes',
		{ timeout: 120_000 },
		async () => {
			const harness = await floodHarness();
			try {
				const engine = harness.engine;
				const floods = () => harness.ofType('demand.flood-detected');
				const productRequests = () =>
					harness.requests.filter((request) => request.path.endsWith('/products')).length;

				let nextRequireId = 0;
				let nextWooId = 1;
				const freshIds = (count: number) =>
					Array.from({ length: count }, () => {
						nextWooId += 1;
						return nextWooId;
					});
				const requireOnce = async (remoteIds: number[]) => {
					nextRequireId += 1;
					const outcome = await engine.require({
						id: `flood-${nextRequireId}`,
						collection: 'products',
						kind: 'targeted-records',
						remoteIds: remoteIds.map(remoteId),
					}).ready;
					// The demand path answers normally throughout: nothing is released,
					// dropped, or failed by the detector.
					expect(outcome.action).toBe('fetched');
					return outcome;
				};
				/** Breach the open detector tick, then advance the clock past it. */
				const breachingTick = async () => {
					const start = productRequests();
					while (productRequests() - start <= DEMAND_FLOOD_REQUESTS_PER_TICK) {
						await requireOnce(freshIds(500));
					}
					harness.clock.advance(DEMAND_FLOOD_TICK_MS);
					return productRequests() - start;
				};
				/** A quiet tick: demand well below threshold, clock advanced past it. */
				const quietTick = async () => {
					await requireOnce(freshIds(1));
					harness.clock.advance(DEMAND_FLOOD_TICK_MS);
				};

				// ——— Below the bar: two breaching ticks (a legitimate spike, e.g. a
				// huge Reports fetch-to-completion) never alarm. ———
				await breachingTick();
				await breachingTick();
				await quietTick(); // closes breach 2, then recovers
				expect(floods()).toHaveLength(0);

				// ——— A sustained flood: three consecutive breaching ticks. ———
				const breachCounts = [await breachingTick(), await breachingTick(), await breachingTick()];
				// The third breaching tick closes on the flood's NEXT request — the
				// detector is timer-free, so a request carries the verdict…
				const requestsBeforeVerdict = productRequests();
				await requireOnce(freshIds(1));
				// …and that request itself still executed. Detection is passive.
				expect(productRequests()).toBe(requestsBeforeVerdict + 1);
				expect(floods()).toHaveLength(1);
				const [flood] = floods();
				expect(flood.level).toBe('warn');
				expect(flood.fields).toMatchObject({
					threshold: DEMAND_FLOOD_REQUESTS_PER_TICK,
					windowMs: DEMAND_FLOOD_TICK_MS,
					consecutiveTicks: 3,
				});
				expect(flood.fields!.requests).toBeGreaterThan(DEMAND_FLOOD_REQUESTS_PER_TICK);
				expect(breachCounts.every((count) => count > DEMAND_FLOOD_REQUESTS_PER_TICK)).toBe(true);
				expect(typeof (flood.fields as { scopeId?: unknown }).scopeId).toBe('string');

				// ——— The same flood continuing does not repeat the alarm. (No clock
				// advance first: the verdict request above already opened the next
				// tick, and the flood keeps filling it.) ———
				await breachingTick();
				await requireOnce(freshIds(1));
				expect(floods()).toHaveLength(1);

				// ——— Recovery re-arms; a second episode reports again. ———
				await quietTick();
				await breachingTick();
				await breachingTick();
				await breachingTick();
				await requireOnce(freshIds(1));
				expect(floods()).toHaveLength(2);
			} finally {
				await harness.dispose();
			}
		}
	);
});
