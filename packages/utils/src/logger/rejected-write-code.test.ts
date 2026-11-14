import { rejectedWriteCode } from './rejected-write-code';

describe('rejectedWriteCode', () => {
	it('maps a store refusal the same way for every reporter', () => {
		expect(rejectedWriteCode(403, 'woocommerce_rest_cannot_edit')).toBe('AUTH201');
		expect(rejectedWriteCode(400, 'pos_data_invalid')).toBe('SYNC211');
		expect(rejectedWriteCode(400, 'rest_invalid_param')).toBe('SYNC211');
		expect(rejectedWriteCode(400, 'registration-error-email-exists')).toBe('SYNC201');
		expect(rejectedWriteCode(404, 'woo_rxdb_sync_record_not_found')).toBe('SYNC203');
		expect(rejectedWriteCode(400, 'woo_rxdb_sync_record_not_found')).toBe('SYNC201');
		expect(rejectedWriteCode(undefined, undefined)).toBe('SYNC201');
	});
});
