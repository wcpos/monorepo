import type { useQueryRuntime } from '@wcpos/query';

import { createMoneyOwnerHintWriter } from './money-owner-hint-writer';
import { findEngineResident, plainPatch } from './plain-patch';

jest.mock('./plain-patch', () => ({
	findEngineResident: jest.fn(async () => ({})),
	plainPatch: jest.fn(async () => {}),
}));
it.each(['1.3', '1.2', null])('writes hints only before 1.3 (%s)', async (storeContract) => {
	jest.clearAllMocks();
	let listener!: (event: { type: string; recordId: string }) => void;
	const manager = {
		engine: {
			events: (fn: typeof listener) => {
				listener = fn;
				return () => {};
			},
		},
	};
	const stop = createMoneyOwnerHintWriter(
		manager as unknown as ReturnType<typeof useQueryRuntime>,
		{ storeContract: () => storeContract }
	);
	listener({ type: 'order-money-divergence', recordId: 'order' });
	await new Promise((resolve) => setImmediate(resolve));
	if (storeContract === '1.3') {
		expect(findEngineResident).not.toHaveBeenCalled();
		expect(plainPatch).not.toHaveBeenCalled();
	} else {
		expect(plainPatch).toHaveBeenCalledTimes(1);
		const input = jest.mocked(plainPatch).mock.calls[0][2];
		expect(input.changes({})).toEqual({
			meta_data: [{ key: '_wcpos_money_owner_hint', value: 'server' }],
		});
	}
	stop();
});
