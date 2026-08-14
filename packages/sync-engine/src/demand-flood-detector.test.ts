/**
 * The demand-path flood detector (#1134 item 2): passive counting, an alarm
 * only after N consecutive breaching ticks, one event per breach episode,
 * re-armed by recovery. The companion engine-level spec
 * (create-rxdb-sync-engine.demand-flood.test.ts) proves the wiring and the
 * passivity of the seam; this file pins the episode state machine.
 */

import { describe, expect, it } from 'vitest';

import type { SyncEvent } from '@wcpos/sync-core';

import {
	createDemandFloodDetector,
	DEMAND_FLOOD_CONSECUTIVE_TICKS,
	DEMAND_FLOOD_REQUESTS_PER_TICK,
	DEMAND_FLOOD_TICK_MS,
} from './demand-flood-detector';

const TICK_MS = 1_000;
const THRESHOLD = 10;
const CONSECUTIVE = 3;

function detectorAt(startMs = 0) {
	const events: SyncEvent[] = [];
	let nowMs = startMs;
	const detector = createDemandFloodDetector({
		diagnostics: (event) => events.push(event),
		now: () => nowMs,
		tickMs: TICK_MS,
		requestsPerTick: THRESHOLD,
		consecutiveTicks: CONSECUTIVE,
	});
	return {
		detector,
		events,
		floods: () => events.filter((event) => event.type === 'demand.flood-detected'),
		advance: (ms: number) => {
			nowMs += ms;
		},
		count: (times: number, scopeId = 'scope-a') => {
			for (let i = 0; i < times; i += 1) detector.countRequest(scopeId);
		},
	};
}

describe('createDemandFloodDetector', () => {
	it('ships thresholds a legitimate burst stays far below', () => {
		// The derived constants are part of the contract: a threshold quietly
		// dropped to the legitimate-burst range would alarm on honest work, and a
		// consecutive-ticks requirement of 1 would alarm on a single spike.
		expect(DEMAND_FLOOD_TICK_MS).toBe(60_000);
		expect(DEMAND_FLOOD_REQUESTS_PER_TICK).toBe(300);
		expect(DEMAND_FLOOD_CONSECUTIVE_TICKS).toBeGreaterThan(1);
	});

	it('stays silent for sustained traffic at or below the threshold', () => {
		const d = detectorAt();
		for (let tick = 0; tick < 10; tick += 1) {
			d.count(THRESHOLD); // at the threshold, never over it
			d.advance(TICK_MS);
		}
		d.count(1); // closes the last tick
		expect(d.floods()).toHaveLength(0);
	});

	it('never alarms on a single breaching spike', () => {
		const d = detectorAt();
		d.count(THRESHOLD * 20); // one enormous spike, all inside one tick
		d.advance(TICK_MS);
		d.count(1); // closes the spike tick (breach 1 of 3)
		d.advance(TICK_MS);
		d.count(1); // closes a quiet tick — recovery
		d.advance(TICK_MS);
		d.count(1);
		expect(d.floods()).toHaveLength(0);
	});

	it('alarms exactly once after N consecutive breaching ticks, with the evidence in fields', () => {
		const d = detectorAt();
		for (let tick = 0; tick < CONSECUTIVE; tick += 1) {
			d.count(THRESHOLD + 5);
			d.advance(TICK_MS);
		}
		d.count(1); // closes the Nth breaching tick → alarm
		expect(d.floods()).toHaveLength(1);
		const [flood] = d.floods();
		expect(flood.level).toBe('warn');
		expect(flood.fields).toMatchObject({
			requests: THRESHOLD + 5,
			threshold: THRESHOLD,
			windowMs: TICK_MS,
			consecutiveTicks: CONSECUTIVE,
			scopeId: 'scope-a',
		});
	});

	it('does not repeat the alarm while the same flood continues', () => {
		const d = detectorAt();
		for (let tick = 0; tick < CONSECUTIVE * 4; tick += 1) {
			d.count(THRESHOLD + 1);
			d.advance(TICK_MS);
		}
		d.count(1);
		expect(d.floods()).toHaveLength(1);
	});

	it('re-arms after recovery and reports a second breach episode', () => {
		const d = detectorAt();
		// Episode one.
		for (let tick = 0; tick < CONSECUTIVE; tick += 1) {
			d.count(THRESHOLD + 1);
			d.advance(TICK_MS);
		}
		d.count(1);
		expect(d.floods()).toHaveLength(1);
		// Recovery: the tick holding that single request closes under threshold.
		d.advance(TICK_MS);
		// Episode two.
		for (let tick = 0; tick < CONSECUTIVE; tick += 1) {
			d.count(THRESHOLD + 1);
			d.advance(TICK_MS);
		}
		d.count(1);
		expect(d.floods()).toHaveLength(2);
	});

	it('treats a fully idle gap as recovery', () => {
		const d = detectorAt();
		// Two of the three needed breaches …
		for (let tick = 0; tick < CONSECUTIVE - 1; tick += 1) {
			d.count(THRESHOLD + 1);
			d.advance(TICK_MS);
		}
		// … then hours of silence before the next breaching run.
		d.advance(TICK_MS * 5_000);
		for (let tick = 0; tick < CONSECUTIVE - 1; tick += 1) {
			d.count(THRESHOLD + 1);
			d.advance(TICK_MS);
		}
		d.count(1);
		// Neither run reached N consecutive breaches on its own.
		expect(d.floods()).toHaveLength(0);
	});

	it('tracks scopes independently', () => {
		const d = detectorAt();
		for (let tick = 0; tick < CONSECUTIVE; tick += 1) {
			d.count(THRESHOLD + 1, 'scope-a');
			d.count(1, 'scope-b');
			d.advance(TICK_MS);
		}
		d.count(1, 'scope-a');
		d.count(1, 'scope-b');
		const floods = d.floods();
		expect(floods).toHaveLength(1);
		expect(floods[0]!.fields).toMatchObject({ scopeId: 'scope-a' });
	});

	it('is passive: counting is synchronous and survives a throwing diagnostics sink', () => {
		let nowMs = 0;
		const detector = createDemandFloodDetector({
			diagnostics: () => {
				throw new Error('broken sink');
			},
			now: () => nowMs,
			tickMs: TICK_MS,
			requestsPerTick: THRESHOLD,
			consecutiveTicks: CONSECUTIVE,
		});
		expect(() => {
			for (let tick = 0; tick < CONSECUTIVE + 2; tick += 1) {
				for (let i = 0; i < THRESHOLD + 1; i += 1) detector.countRequest('scope-a');
				nowMs += TICK_MS;
			}
			// The alarm fires into the throwing sink here — and must not escape.
			detector.countRequest('scope-a');
		}).not.toThrow();
		// And countRequest returns nothing a caller could await or gate on.
		expect(detector.countRequest('scope-a')).toBeUndefined();
	});
});
