import { describe, expect, it } from 'vitest';

import {
	catalogDocumentId,
	customerDocumentId,
	orderDocumentId,
	productDocumentId,
	referenceDocumentId,
	refundDocumentId,
	taxRateDocumentId,
	variationDocumentId,
} from './documentKeys';
import { mintRemoteId } from './remoteIdCodec';

// Every server-born record keys by its Woo id under a fixed entity prefix (ADR 0029);
// changing a prefix or dropping the id would re-key a whole collection on the device.
describe('Woo document keys', () => {
	const remoteId = mintRemoteId(42, 'test');

	it('derives one stable key per entity from the remote id', () => {
		expect(orderDocumentId(remoteId)).toBe('woo-order:42');
		expect(productDocumentId(remoteId)).toBe('woo-product:42');
		expect(variationDocumentId(remoteId)).toBe('woo-variation:42');
		expect(customerDocumentId(remoteId)).toBe('woo-customer:42');
		expect(taxRateDocumentId(remoteId)).toBe('woo-tax-rate:42');
		expect(refundDocumentId(remoteId)).toBe('woo-refund:42');
		expect(referenceDocumentId('woo-category', remoteId)).toBe('woo-category:42');
	});

	it('dispatches the catalog key by entity', () => {
		expect(catalogDocumentId('product', remoteId)).toBe(productDocumentId(remoteId));
		expect(catalogDocumentId('variation', remoteId)).toBe(variationDocumentId(remoteId));
	});
});
