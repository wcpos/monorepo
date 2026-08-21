import { describe, expect, it } from 'vitest';

import { deserializeChangeSignalState, serializeChangeSignalState } from './change-signal-state';

describe('change-signal state journal epoch', () => {
	it('round-trips an adopted epoch', () => {
		const serialized = serializeChangeSignalState({
			cursor: { sequence: 7 },
			baselineDigests: new Map(),
			escalations: [],
			epoch: 'epoch-A',
		});

		expect(deserializeChangeSignalState(serialized)).toMatchObject({
			initialCursor: { sequence: 7 },
			baselineDigests: new Map(),
			epoch: 'epoch-A',
		});
	});

	it('round-trips escalation ledger entries', () => {
		const escalations = [
			{
				id: 80,
				collection: 'products' as const,
				status: 'changed' as const,
				detector: 'hash-checksum' as const,
			},
		];
		const serialized = serializeChangeSignalState({
			cursor: { sequence: 7 },
			baselineDigests: new Map(),
			escalations,
		});

		expect(deserializeChangeSignalState(serialized)).toMatchObject({ escalations });
	});

	it('keeps a pre-epoch state valid as never-seen', () => {
		expect(
			deserializeChangeSignalState(JSON.stringify({ cursor: { sequence: 7 }, baselineDigests: [] }))
		).toEqual({ initialCursor: { sequence: 7 }, baselineDigests: new Map(), escalations: [] });
	});

	it('drops only malformed escalation entries', () => {
		const restored = deserializeChangeSignalState(
			JSON.stringify({
				cursor: { sequence: 7 },
				baselineDigests: [],
				escalations: [
					{ id: 80, collection: 'products', status: 'changed', detector: 'hash-checksum' },
					{ id: 81.5, collection: 'products', status: 'changed', detector: 'hash-checksum' },
					{ id: 82, collection: 'products', status: 'invalid', detector: 'hash-checksum' },
					// Detector/collection pairs outside what a sweep can actually surface:
					// no detector could ever produce cure evidence for these, and clearing
					// them against the wrong detector's sweep would fabricate a recovered
					// row that can mask a genuinely stuck record with the same key.
					{ id: 83, collection: 'products', status: 'changed', detector: 'range-checksum' },
					{ id: 84, collection: 'customers', status: 'changed', detector: 'hash-checksum' },
				],
			})
		);

		expect(restored).toMatchObject({
			escalations: [
				{ id: 80, collection: 'products', status: 'changed', detector: 'hash-checksum' },
			],
		});
	});

	it('rejects a non-string epoch', () => {
		expect(
			deserializeChangeSignalState(
				JSON.stringify({
					cursor: { sequence: 7 },
					baselineDigests: [],
					epoch: 123,
				})
			)
		).toBeNull();
	});
});
