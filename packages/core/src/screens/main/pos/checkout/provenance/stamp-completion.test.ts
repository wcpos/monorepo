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
beforeEach(() => mockWarn.mockClear());
it('stamps the active session alongside the register', async () => {
	const meta = await completionMeta({}, { ...deps, sessionId: 'session' });
	expect(mockWarn).not.toHaveBeenCalled();
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
	expect(mockWarn).toHaveBeenCalledWith(expect.any(String), {
		context: expect.objectContaining({
			type: 'checkout.provenance-skipped',
			reason: 'register_bound_elsewhere',
		}),
	});
});
it('warns, and still counts, a sale on a till with no store register bound', async () => {
	// The device register exists (it always does after hydration); the store side is
	// what is missing, so the counter is stamped and the register is not.
	jest.mocked(readRegister).mockResolvedValueOnce({ sites: {} } as never);
	const meta = await completionMeta({ id: 7, uuid: 'order-7' }, deps);
	const keys = meta.map(({ key }) => key);
	expect(keys).toContain('_wcpos_sale_counter');
	expect(keys).not.toContain('_wcpos_register');
	expect(mockWarn).toHaveBeenCalledWith(expect.any(String), {
		context: expect.objectContaining({
			type: 'checkout.provenance-skipped',
			reason: 'no_register_bound',
			recordId: 'order-7',
		}),
	});
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
	const stamped = await completionMeta(
		{ id: 1041, uuid: 'order-1' },
		{ ...deps, sessionId: 'session' }
	);
	// What is known is stamped; the register and the counter are not invented.
	const keys = stamped.map(({ key }) => key);
	expect(keys).toEqual(
		expect.arrayContaining([
			'_wcpos_sale_time',
			'_wcpos_sale_tz',
			'_wcpos_app_version',
			'_wcpos_session',
		])
	);
	expect(keys).not.toContain('_wcpos_register');
	expect(keys).not.toContain('_wcpos_sale_counter');
	expect(mockWarn).toHaveBeenCalledWith(expect.any(String), {
		context: {
			type: 'checkout.provenance-skipped',
			reason: 'no_register_document',
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
	expect((await completionMeta({}, deps)).map(({ key }) => key)).toContain('_wcpos_sale_time');
	expect(mockWarn).toHaveBeenCalledWith(expect.any(String), {
		context: { type: 'checkout.provenance-skipped', reason: 'no_register_document', storeId: null },
	});

	// Revisiting a sale that already carries the partial tuple neither re-stamps it
	// nor warns again: one row per sale, and the first sale time stands.
	mockWarn.mockClear();
	jest.mocked(readRegister).mockResolvedValueOnce(null);
	expect(await completionMeta({ meta_data: stamped }, deps)).toEqual(stamped);
	expect(mockWarn).not.toHaveBeenCalled();
});

it('does not name an unsynced sale as order 0', async () => {
	// `id: 0` is what an order carries before the store has seen it. Naming it
	// would key every such sale to one record and fold them into a single row.
	jest.mocked(readRegister).mockResolvedValueOnce(null);
	expect((await completionMeta({ id: 0 }, deps)).map(({ key }) => key)).not.toContain(
		'_wcpos_register'
	);
	expect(mockWarn).toHaveBeenCalledWith(expect.any(String), {
		context: { type: 'checkout.provenance-skipped', reason: 'no_register_document', storeId: null },
	});
});
