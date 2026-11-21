import { deriveUserCapabilities } from './user-capabilities';

const ALL_FALSE = {
	canEditProducts: false,
	canEditVariations: false,
	canCreateProducts: false,
	canDeleteProducts: false,
	canDeleteVariations: false,
	canEditCoupons: false,
	canCreateCoupons: false,
	canDeleteCoupons: false,
	canEditCustomers: false,
	canCreateCustomers: false,
	canDeleteCustomers: false,
	canAcceptReaderTerms: false,
	canReassignSales: false,
};
const ALL_TRUE = {
	canEditProducts: true,
	canEditVariations: true,
	canCreateProducts: true,
	canDeleteProducts: true,
	canDeleteVariations: true,
	canEditCoupons: true,
	canCreateCoupons: true,
	canDeleteCoupons: true,
	canEditCustomers: true,
	canCreateCustomers: true,
	canDeleteCustomers: true,
	canAcceptReaderTerms: true,
	canReassignSales: true,
};

describe('deriveUserCapabilities', () => {
	it('fails open when capabilities are unknown, except accepting reader terms and reassigning sales', () => {
		const result = deriveUserCapabilities(undefined);

		expect(result.known).toBe(false);
		// Apple's Tap to Pay terms may only be accepted by a known administrator; the store
		// ignores a reassignment it refuses, so an unknown user never sees the picker.
		expect(result.caps).toEqual({
			...ALL_TRUE,
			canAcceptReaderTerms: false,
			canReassignSales: false,
		});
	});

	it('lets manage_woocommerce accept reader terms', () => {
		expect(deriveUserCapabilities(['manage_woocommerce']).caps.canAcceptReaderTerms).toBe(true);
	});

	it('lets only reassign_woocommerce_pos_sales reassign sales', () => {
		expect(deriveUserCapabilities(['reassign_woocommerce_pos_sales']).caps.canReassignSales).toBe(
			true
		);
		expect(deriveUserCapabilities(['manage_woocommerce']).caps.canReassignSales).toBe(false);
	});

	it('closes every gate for a known empty capability list', () => {
		expect(deriveUserCapabilities([])).toEqual({
			known: true,
			caps: ALL_FALSE,
		});
	});

	it('requires the complete product edit triple and the literal variation capability', () => {
		expect(deriveUserCapabilities(['edit_products']).caps.canEditProducts).toBe(false);

		const productCaps = ['edit_products', 'edit_others_products', 'edit_published_products'];
		expect(deriveUserCapabilities(productCaps).caps).toMatchObject({
			canEditProducts: true,
			canEditVariations: false,
		});
		expect(deriveUserCapabilities([...productCaps, 'edit_product']).caps.canEditVariations).toBe(
			true
		);
	});

	it.each(['create_customers', 'promote_users'])(
		'allows customer creation through %s',
		(capability) => {
			expect(deriveUserCapabilities([capability]).caps.canCreateCustomers).toBe(true);
		}
	);
});
