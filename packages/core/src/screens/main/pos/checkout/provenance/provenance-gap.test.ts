import type { UserDatabase } from '@wcpos/database';

import { reportProvenanceGap } from './provenance-gap';

import type { RegisterDocument } from '../../../../../services/register/register-document';

const mockWarn = jest.fn();
let mockRegister: RegisterDocument;
const mockUserDB = {
	getLocal: async () => ({ toJSON: () => ({ data: mockRegister }) }),
};
beforeEach(() => {
	mockRegister = {
		id: 'device',
		name: 'Till',
		platform: 'web',
		created_at: '2026-09-18T00:00:00.000Z',
		sites: {},
	};
});
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: (...args: unknown[]) => mockWarn(...args) }),
}));
const deps = { userDB: mockUserDB as unknown as UserDatabase, siteUuid: 'site', storeId: 1 };
beforeEach(() => {
	mockWarn.mockClear();
});
it('stays silent for a sale that carries its store register', async () => {
	await reportProvenanceGap({
		...deps,
		order: { id: 7, uuid: 'order-7', meta_data: [{ key: '_wcpos_register', value: 'r' }] },
	});
	expect(mockWarn).not.toHaveBeenCalled();
});
it('names the sale and the reason when no store register is bound', async () => {
	await reportProvenanceGap({ ...deps, order: { id: 7, uuid: 'order-7', meta_data: [] } });
	expect(mockWarn).toHaveBeenCalledWith('Sale recorded without register provenance', {
		context: {
			type: 'checkout.provenance-skipped',
			reason: 'no_register_bound',
			orderId: 7,
			orderUUID: 'order-7',
			recordId: 'order-7',
			storeId: 1,
		},
	});
});
it('tells a register bound in another store apart from none, and never names order 0', async () => {
	mockRegister.sites.site = {
		sale_counter: 0,
		register_id: 'elsewhere',
		register_name: 'Other',
		register_store_id: 2,
	};
	await reportProvenanceGap({ ...deps, order: { id: 0, uuid: 'order-0', meta_data: [] } });
	expect(mockWarn).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			context: expect.not.objectContaining({ orderId: expect.anything() }),
		})
	);
	expect(mockWarn.mock.calls[0][1].context.reason).toBe('register_bound_elsewhere');
});
