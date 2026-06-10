/** String(number) — '95.5', never '95.50'. Per-field precision: §7 of spec. */
export type MoneyString = string;

// ===== structural inputs (assignability-tested against @wcpos/database) =====

export interface MetaDataInput {
	id?: number;
	key?: string;
	value?: string;
	display_key?: string;
	display_value?: string;
}

export interface TaxEntryInput {
	id?: number;
	subtotal?: string;
	total?: string;
}

export interface LineItemInput {
	product_id?: number | null; // null ⇒ tombstone
	variation_id?: number | null;
	quantity?: number;
	price?: number;
	tax_class?: string | null;
	tax_status?: string | null;
	subtotal?: string;
	subtotal_tax?: string;
	total?: string;
	total_tax?: string;
	taxes?: TaxEntryInput[];
	meta_data?: MetaDataInput[];
}

export interface FeeLineInput {
	name?: string | null; // null ⇒ tombstone
	tax_class?: string | null;
	tax_status?: string | null;
	total?: string;
	total_tax?: string;
	taxes?: TaxEntryInput[];
	meta_data?: MetaDataInput[];
}

export interface ShippingLineInput {
	method_id?: string | null; // null ⇒ tombstone
	method_title?: string | null;
	total?: string;
	total_tax?: string;
	taxes?: TaxEntryInput[];
	meta_data?: MetaDataInput[];
}

export interface CouponLineInput {
	code?: string | null; // null/undefined ⇒ tombstone (loose != null)
	discount?: string;
	discount_tax?: string;
	meta_data?: MetaDataInput[];
}

export interface TaxRateInput {
	id?: number;
	name?: string;
	rate?: string;
	compound?: boolean;
	order?: number;
	class?: string;
	shipping?: boolean;
	country?: string;
	state?: string;
}

// ===== coupon context (adapter prefetches async; module stays sync) =====

export interface CouponInput {
	code: string;
	discount_type: 'percent' | 'fixed_cart' | 'fixed_product';
	amount: string;
	limit_usage_to_x_items?: number | null;
	product_ids?: readonly number[];
	excluded_product_ids?: readonly number[];
	product_categories?: readonly number[];
	excluded_product_categories?: readonly number[];
	exclude_sale_items?: boolean;
	individual_use?: boolean; // read for already-applied coupons too (reverse check)
	// validation-only fields (read only when code ∈ validate.codes):
	date_expires_gmt?: string | null;
	usage_limit?: number | null;
	usage_count?: number;
	usage_limit_per_user?: number | null;
	used_by?: readonly (string | number)[];
	minimum_amount?: string;
	maximum_amount?: string;
	email_restrictions?: readonly string[];
}

export interface CouponContext {
	/** key = LOWERCASE code. Must contain every active coupon_lines code + every validate.codes entry. */
	readonly coupons: ReadonlyMap<string, CouponInput>;
	/** Directly-assigned categories per product_id (NOT enriched — enrichment is internal). */
	readonly productCategories: ReadonlyMap<number, readonly { id: number }[]>;
	/** category_id -> parent_id; module walks ancestors itself (wc_get_product_cat_ids parity). */
	readonly categoryParents?: ReadonlyMap<number, number>;
}

// ===== warnings (the logger port, inverted to data-out) =====

export interface WarningSite {
	lineType: 'line_item' | 'fee_line' | 'shipping_line' | 'coupon_line';
	index: number;
	uuid?: string;
}

export type EngineWarning =
	| { code: 'malformed_pos_data'; where: WarningSite }
	| { code: 'unknown_tax_rate_id'; rateId: number };

// ===== coupon rejection (moved from internal/coupons/validate.ts) =====

export type CouponRejectionCode =
	| 'already_applied'
	| 'expired'
	| 'usage_limit_reached'
	| 'usage_limit_reached_for_customer'
	| 'minimum_spend_not_met'
	| 'maximum_spend_exceeded'
	| 'individual_use'
	| 'individual_use_conflict'
	| 'email_required'
	| 'email_not_allowed'
	| 'not_applicable_to_cart';

export interface CouponRejection {
	code: CouponRejectionCode;
	params?: Readonly<Record<string, string | number>>;
}

// ===== refund =====

export interface RefundLike {
	total?: string | number | null;
	amount?: string | number | null;
}
