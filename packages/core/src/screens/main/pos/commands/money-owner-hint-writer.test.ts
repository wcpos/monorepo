import type { useQueryRuntime } from '@wcpos/query';

import { createMoneyOwnerHintWriter } from './money-owner-hint-writer';
import { findEngineResident, writeOrderChanges } from './write-order-changes';

jest.mock('./write-order-changes', () => ({
	findEngineResident: jest.fn(async () => ({})),
	writeOrderChanges: jest.fn(async () => {}),
}));

// The hint is ADR 0032's line-money ownership; ADR 0040's contract does not stand it down.
it('writes the hint at contract 1.3', async () => {
	let listener!: (event: { type: string; recordId: string }) => void;
	const manager = {
		engine: {
			events: (fn: typeof listener) => {
				listener = fn;
				return () => {};
			},
		},
	};
	// The writer takes no contract: a store reporting 1.3 cannot stand it down.
	const stop = createMoneyOwnerHintWriter(manager as unknown as ReturnType<typeof useQueryRuntime>);
	listener({ type: 'order-money-divergence', recordId: 'order' });
	await new Promise((resolve) => setImmediate(resolve));
	expect(writeOrderChanges).toHaveBeenCalledTimes(1);
	expect(findEngineResident).toHaveBeenCalledTimes(1);
	const input = jest.mocked(writeOrderChanges).mock.calls[0][1];
	expect(input.changes({})).toEqual({
		meta_data: [{ key: '_wcpos_money_owner_hint', value: 'server' }],
	});
	stop();
});
