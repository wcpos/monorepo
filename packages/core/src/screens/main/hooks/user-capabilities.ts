export interface UserCapabilities {
	canEditProducts: boolean;
	canEditVariations: boolean;
	canCreateProducts: boolean;
	canDeleteProducts: boolean;
	canDeleteVariations: boolean;
	canEditCoupons: boolean;
	canCreateCoupons: boolean;
	canDeleteCoupons: boolean;
	canEditCustomers: boolean;
	canCreateCustomers: boolean;
	canDeleteCustomers: boolean;
	/**
	 * Accept a card provider's Tap to Pay terms on behalf of the business. Apple requires an
	 * administrator (`manage_woocommerce`).
	 */
	canAcceptReaderTerms: boolean;
	/**
	 * Change an order's cashier or store with `reassign_woocommerce_pos_sales`.
	 */
	canReassignSales: boolean;
	/** View reports with `view_woocommerce_pos_reports`. */
	canViewReports: boolean;
	/** Manage cash with `manage_woocommerce_pos_cash`. */
	canManageCash: boolean;
	/** Manage closures with `manage_woocommerce_pos_closures`. */
	canManageClosures: boolean;
	/** Manage POS with `manage_woocommerce_pos`. */
	canManagePos: boolean;
}

export interface DerivedUserCapabilities {
	caps: UserCapabilities;
	known: boolean;
}

/** An unknown capability list denies every gate (cashier-permissions spec §4). */
export function deriveUserCapabilities(
	capabilities: readonly string[] | undefined
): DerivedUserCapabilities {
	const known = capabilities !== undefined;
	const granted = new Set(capabilities);
	const has = (capability: string) => known && granted.has(capability);
	const canEditProducts =
		has('edit_products') && has('edit_others_products') && has('edit_published_products');
	const canDeleteProducts =
		has('delete_products') && has('delete_others_products') && has('delete_published_products');

	return {
		known,
		caps: {
			canEditProducts,
			canEditVariations: canEditProducts && has('edit_product'),
			canCreateProducts: has('publish_products') && has('edit_products'),
			canDeleteProducts,
			canDeleteVariations: canDeleteProducts && has('delete_product'),
			canEditCoupons:
				has('edit_shop_coupons') &&
				has('edit_others_shop_coupons') &&
				has('edit_published_shop_coupons'),
			canCreateCoupons: has('publish_shop_coupons') && has('edit_shop_coupons'),
			canDeleteCoupons:
				has('delete_shop_coupons') &&
				has('delete_others_shop_coupons') &&
				has('delete_published_shop_coupons'),
			canEditCustomers: has('edit_users'),
			canCreateCustomers: has('create_customers') || has('promote_users'),
			canDeleteCustomers: has('delete_users'),
			canAcceptReaderTerms: has('manage_woocommerce'),
			canReassignSales: has('reassign_woocommerce_pos_sales'),
			canViewReports: has('view_woocommerce_pos_reports'),
			canManageCash: has('manage_woocommerce_pos_cash'),
			canManageClosures: has('manage_woocommerce_pos_closures'),
			canManagePos: has('manage_woocommerce_pos'),
		},
	};
}
