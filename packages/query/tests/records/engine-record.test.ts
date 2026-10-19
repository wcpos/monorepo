import { isRecordClosed } from '../../src/records/engine-record';

describe('isRecordClosed', () => {
	it('returns false for an open collection, including temporary orders', () => {
		expect(isRecordClosed({ collection: { name: 'temporaryOrders', closed: false } })).toBe(false);
	});

	it('returns true for a closed collection, including temporary orders', () => {
		expect(isRecordClosed({ collection: { name: 'temporaryOrders', closed: true } })).toBe(true);
	});

	it('returns false when the record has no collection', () => {
		expect(isRecordClosed({})).toBe(false);
	});
});
