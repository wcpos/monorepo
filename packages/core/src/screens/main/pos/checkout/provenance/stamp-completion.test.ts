import type { UserDatabase } from '@wcpos/database';

import { readRegister } from '../../../../../services/register/register-document';
import { completionMeta } from './stamp-completion';

const mockWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: (...args: unknown[]) => mockWarn(...args) }),
}));
jest.mock('../../../../../services/register/register-document', () => ({
	readRegister: jest.fn(async () => ({
		sites: { site: { register_id: 'register', register_store_id: 1 } },
	})),
	nextSaleCounter: async () => 1,
}));
jest.mock('@wcpos/utils/app-info', () => ({ AppInfo: { version: 'test', buildNumber: 'test' } }));
const deps = { userDB: {} as UserDatabase, siteUuid: 'site' };
it('stamps the active session alongside the register', async () => {
	const meta = await completionMeta({}, { ...deps, sessionId: 'session' });
	expect(meta).toEqual(
		expect.arrayContaining([
			{ key: '_wcpos_session', value: 'session' },
			{ key: '_wcpos_register', value: 'register' },
		])
	);
});
it('does not stamp a register bound in another store of the site', async () => {
	const meta = await completionMeta({}, { ...deps, storeId: 2, sessionId: 'session' });
	expect(meta.some(({ key }) => key === '_wcpos_register')).toBe(false);
	expect(meta.some(({ key }) => key === '_wcpos_sale_counter')).toBe(true);
});
it('does not invent a session when sessions are off', async () => {
	expect((await completionMeta({}, deps)).some(({ key }) => key === '_wcpos_session')).toBe(false);
});
it('preserves the original completion tuple when revisiting a sale', async () => {
	const meta_data = await completionMeta({}, { ...deps, sessionId: 'first' });
	expect(await completionMeta({ meta_data }, { ...deps, sessionId: 'second' })).toEqual(meta_data);
});

it('warns without an actor when completion has no register, naming the sale where it can', async () => {
	// No actor: this is the system noticing a gap, not a cashier doing something.
	jest.mocked(readRegister).mockResolvedValueOnce(null);
	expect(await completionMeta({ id: 1041, uuid: 'order-1' }, deps)).toEqual([]);
	expect(mockWarn).toHaveBeenCalledWith(expect.any(String), {
		context: {
			type: 'checkout.provenance-skipped',
			orderId: 1041,
			orderUUID: 'order-1',
			// Part of the collapse identity: two unstamped sales inside the 60-second
			// window would otherwise fold into one row keeping only the first sale's ids.
			recordId: 'order-1',
			storeId: null,
		},
	});

	// Callers that hold only the meta tuple still get a row; a sale that went
	// unstamped is worth recording even when it cannot be named.
	mockWarn.mockClear();
	jest.mocked(readRegister).mockResolvedValueOnce(null);
	expect(await completionMeta({}, deps)).toEqual([]);
	expect(mockWarn).toHaveBeenCalledWith(expect.any(String), {
		context: { type: 'checkout.provenance-skipped', storeId: null },
	});
});

it('does not name an unsynced sale as order 0', async () => {
	// `id: 0` is what an order carries before the store has seen it. Naming it
	// would key every such sale to one record and fold them into a single row.
	jest.mocked(readRegister).mockResolvedValueOnce(null);
	expect(await completionMeta({ id: 0 }, deps)).toEqual([]);
	expect(mockWarn).toHaveBeenCalledWith(expect.any(String), {
		context: { type: 'checkout.provenance-skipped', storeId: null },
	});
});
