import { describe, expect, it } from 'vitest';

import { deserializeChangeSignalState, serializeChangeSignalState } from './change-signal-state';

describe('change-signal state journal epoch', () => {
	it('round-trips an adopted epoch', () => {
		const serialized = serializeChangeSignalState({
			cursor: { sequence: 7 },
			baselineDigests: new Map(),
			epoch: 'epoch-A',
		});

		expect(deserializeChangeSignalState(serialized)).toMatchObject({
			initialCursor: { sequence: 7 },
			baselineDigests: new Map(),
			epoch: 'epoch-A',
		});
	});

	it('keeps a pre-epoch state valid as never-seen', () => {
		expect(
			deserializeChangeSignalState(JSON.stringify({ cursor: { sequence: 7 }, baselineDigests: [] }))
		).toEqual({ initialCursor: { sequence: 7 }, baselineDigests: new Map() });
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
