import { createScopeBarcodeSelectors } from './barcode-selectors';

describe('scope barcode selector snapshots', () => {
	it('prevents callers from mutating a published snapshot', () => {
		const scope = createScopeBarcodeSelectors();
		scope.publish('products', ['sku']);
		const snapshot = scope.current() as {
			products: string[];
			variations: string[];
		};

		expect(() => snapshot.products.push('global_unique_id')).toThrow(TypeError);
		expect(() => {
			snapshot.products = [];
		}).toThrow(TypeError);
		expect(scope.current().products).toEqual(['sku']);
	});
});
