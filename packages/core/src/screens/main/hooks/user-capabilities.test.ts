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
	canViewReports: false,
	canManageCash: false,
	canManageClosures: false,
	canManagePos: false,
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
	canViewReports: true,
	canManageCash: true,
	canManageClosures: true,
	canManagePos: true,
};

describe('deriveUserCapabilities', () => {
	it('denies every gate when capabilities are unknown', () => {
		expect(deriveUserCapabilities(undefined)).toEqual({ known: false, caps: ALL_FALSE });
	});

	it.each(Object.keys(ALL_FALSE) as (keyof typeof ALL_FALSE)[])(
		'denies %s for unknown and empty capabilities',
		(flag) => {
			expect(deriveUserCapabilities(undefined).caps[flag]).toBe(false);
			expect(deriveUserCapabilities([]).caps[flag]).toBe(false);
		}
	);

	it.each([
		['canViewReports', 'view_woocommerce_pos_reports'],
		['canManageCash', 'manage_woocommerce_pos_cash'],
		['canManageClosures', 'manage_woocommerce_pos_closures'],
		['canManagePos', 'manage_woocommerce_pos'],
	] as const)('grants %s only with %s', (flag, capability) => {
		expect(deriveUserCapabilities([capability]).caps[flag]).toBe(true);
		expect(deriveUserCapabilities(['manage_woocommerce']).caps[flag]).toBe(false);
	});

	it('grants every gate with all required capabilities', () => {
		expect(
			deriveUserCapabilities([
				'edit_products',
				'edit_others_products',
				'edit_published_products',
				'edit_product',
				'publish_products',
				'delete_products',
				'delete_others_products',
				'delete_published_products',
				'delete_product',
				'edit_shop_coupons',
				'edit_others_shop_coupons',
				'edit_published_shop_coupons',
				'publish_shop_coupons',
				'delete_shop_coupons',
				'delete_others_shop_coupons',
				'delete_published_shop_coupons',
				'edit_users',
				'create_customers',
				'delete_users',
				'manage_woocommerce',
				'reassign_woocommerce_pos_sales',
				'view_woocommerce_pos_reports',
				'manage_woocommerce_pos_cash',
				'manage_woocommerce_pos_closures',
				'manage_woocommerce_pos',
			])
		).toEqual({ known: true, caps: ALL_TRUE });
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
