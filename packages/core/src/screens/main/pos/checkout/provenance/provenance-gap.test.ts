import type { UserDatabase } from '@wcpos/database';

import { reportProvenanceGap } from './provenance-gap';

const mockWarn = jest.fn();
let mockBound: { id: string; name: string } | null = null;
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: (...args: unknown[]) => mockWarn(...args) }),
}));
jest.mock('../../../../../services/register/register-document', () => ({
	readBoundRegister: async () => mockBound,
}));
const deps = { userDB: {} as UserDatabase, siteUuid: 'site', storeId: 1 };
beforeEach(() => {
	mockWarn.mockClear();
	mockBound = null;
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
	mockBound = { id: 'elsewhere', name: 'Other' };
	await reportProvenanceGap({ ...deps, order: { id: 0, uuid: 'order-0', meta_data: [] } });
	expect(mockWarn).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			context: expect.not.objectContaining({ orderId: expect.anything() }),
		})
	);
	expect(mockWarn.mock.calls[0][1].context.reason).toBe('register_bound_elsewhere');
});
