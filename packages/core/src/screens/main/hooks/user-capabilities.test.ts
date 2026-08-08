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
};

describe('deriveUserCapabilities', () => {
	it('fails open when capabilities are unknown', () => {
		const result = deriveUserCapabilities(undefined);

		expect(result.known).toBe(false);
		expect(result.caps).toEqual(ALL_TRUE);
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
