/**
 * @jest-environment node
 *
 * Tests for coupon validation logic.
 *
 * validateCoupon mirrors WooCommerce's server-side coupon checks so the POS
 * can give instant feedback before sending the order to the server. Every
 * validation rule has its own describe block with pass/fail edge cases.
 */
import { type CouponValidationContext, validateCoupon } from './coupon-validation';

import type { CouponLineItem } from './coupon-helpers';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const createItem = (overrides: Partial<CouponLineItem> = {}): CouponLineItem => ({
	product_id: 1,
	quantity: 1,
	price: 25,
	subtotal: '25',
	total: '25',
	categories: [{ id: 100 }],
	on_sale: false,
	...overrides,
});

const createContext = (
	overrides: Partial<CouponValidationContext> = {}
): CouponValidationContext => ({
	lineItems: [createItem()],
	appliedCoupons: [],
	cartSubtotal: 100,
	customerEmail: 'test@example.com',
	customerId: 42,
	...overrides,
});

const createCoupon = (overrides: Record<string, unknown> = {}) => ({
	code: 'SAVE10',
	discount_type: 'percent',
	amount: '10',
	date_expires_gmt: null,
	usage_limit: null,
	usage_count: 0,
	usage_limit_per_user: null,
	used_by: [],
	minimum_amount: '',
	maximum_amount: '',
	individual_use: false,
	email_restrictions: [],
	product_ids: [],
	excluded_product_ids: [],
	product_categories: [],
	excluded_product_categories: [],
	exclude_sale_items: false,
	...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('coupon-validation', () => {
	describe('validateCoupon', () => {
		// ---------------------------------------------------------------
		// Already applied
		// ---------------------------------------------------------------
		describe('already applied check', () => {
			it('should fail when the same coupon code is already applied', () => {
				const coupon = createCoupon({ code: 'SAVE10' });
				const context = createContext({ appliedCoupons: ['SAVE10'] });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(false);
				expect(result.error).toBe('This coupon has already been applied.');
			});

			it('should pass when a different coupon is applied', () => {
				const coupon = createCoupon({ code: 'SAVE10' });
				const context = createContext({ appliedCoupons: ['OTHER'] });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});
		});

		// ---------------------------------------------------------------
		// Expiry
		// ---------------------------------------------------------------
		describe('expiry check', () => {
			it('should pass when no expiry date is set', () => {
				const coupon = createCoupon({ date_expires_gmt: null });
				const result = validateCoupon(coupon, createContext());
				expect(result.valid).toBe(true);
			});

			it('should pass when expiry date is in the future', () => {
				const future = new Date(Date.now() + 86_400_000).toISOString();
				const coupon = createCoupon({ date_expires_gmt: future });

				const result = validateCoupon(coupon, createContext());
				expect(result.valid).toBe(true);
			});

			it('should fail when expiry date is in the past', () => {
				const past = new Date(Date.now() - 86_400_000).toISOString();
				const coupon = createCoupon({ date_expires_gmt: past });

				const result = validateCoupon(coupon, createContext());
				expect(result.valid).toBe(false);
				expect(result.error).toBe('This coupon has expired.');
			});
		});

		// ---------------------------------------------------------------
		// Usage limit
		// ---------------------------------------------------------------
		describe('usage limit check', () => {
			it('should pass when no usage limit is set', () => {
				const coupon = createCoupon({ usage_limit: null, usage_count: 99 });
				const result = validateCoupon(coupon, createContext());
				expect(result.valid).toBe(true);
			});

			it('should pass when usage_limit is 0 (unlimited)', () => {
				const coupon = createCoupon({ usage_limit: 0, usage_count: 99 });
				const result = validateCoupon(coupon, createContext());
				expect(result.valid).toBe(true);
			});

			it('should pass when usage count is below the limit', () => {
				const coupon = createCoupon({ usage_limit: 10, usage_count: 5 });
				const result = validateCoupon(coupon, createContext());
				expect(result.valid).toBe(true);
			});

			it('should fail when usage count equals the limit', () => {
				const coupon = createCoupon({ usage_limit: 10, usage_count: 10 });
				const result = validateCoupon(coupon, createContext());
				expect(result.valid).toBe(false);
				expect(result.error).toBe('Coupon usage limit has been reached.');
			});

			it('should fail when usage count exceeds the limit', () => {
				const coupon = createCoupon({ usage_limit: 5, usage_count: 8 });
				const result = validateCoupon(coupon, createContext());
				expect(result.valid).toBe(false);
				expect(result.error).toBe('Coupon usage limit has been reached.');
			});
		});

		// ---------------------------------------------------------------
		// Per-user usage limit
		// ---------------------------------------------------------------
		describe('per-user usage limit check', () => {
			it('should pass when no per-user limit is set', () => {
				const coupon = createCoupon({ usage_limit_per_user: null });
				const result = validateCoupon(coupon, createContext());
				expect(result.valid).toBe(true);
			});

			it('should pass when per-user limit is 0 (unlimited)', () => {
				const coupon = createCoupon({ usage_limit_per_user: 0 });
				const result = validateCoupon(coupon, createContext());
				expect(result.valid).toBe(true);
			});

			it('should pass when user usage count is below the per-user limit', () => {
				const coupon = createCoupon({
					usage_limit_per_user: 3,
					used_by: ['42', '99'],
				});
				const context = createContext({ customerId: 42 });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should fail when user usage count meets the per-user limit', () => {
				const coupon = createCoupon({
					usage_limit_per_user: 2,
					used_by: ['42', '99', '42'],
				});
				const context = createContext({ customerId: 42 });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(false);
				expect(result.error).toBe('Coupon usage limit has been reached for this customer.');
			});

			it('should skip the check when there is no customer on the order', () => {
				const coupon = createCoupon({
					usage_limit_per_user: 1,
					used_by: ['42', '42', '42'],
				});
				const context = createContext({ customerId: null });

				// Cannot verify per-user limit without a customer, so pass
				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should handle numeric IDs in used_by alongside string customerId comparison', () => {
				const coupon = createCoupon({
					usage_limit_per_user: 1,
					used_by: [42],
				});
				const context = createContext({ customerId: 42 });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(false);
				expect(result.error).toBe('Coupon usage limit has been reached for this customer.');
			});
		});

		// ---------------------------------------------------------------
		// Minimum amount
		// ---------------------------------------------------------------
		describe('minimum amount check', () => {
			it('should pass when no minimum is set', () => {
				const coupon = createCoupon({ minimum_amount: '' });
				const result = validateCoupon(coupon, createContext({ cartSubtotal: 1 }));
				expect(result.valid).toBe(true);
			});

			it('should pass when minimum_amount is "0"', () => {
				const coupon = createCoupon({ minimum_amount: '0' });
				const result = validateCoupon(coupon, createContext({ cartSubtotal: 1 }));
				expect(result.valid).toBe(true);
			});

			it('should pass when cart subtotal meets the minimum', () => {
				const coupon = createCoupon({ minimum_amount: '50' });
				const result = validateCoupon(coupon, createContext({ cartSubtotal: 50 }));
				expect(result.valid).toBe(true);
			});

			it('should pass when cart subtotal exceeds the minimum', () => {
				const coupon = createCoupon({ minimum_amount: '50' });
				const result = validateCoupon(coupon, createContext({ cartSubtotal: 100 }));
				expect(result.valid).toBe(true);
			});

			it('should fail when cart subtotal is below the minimum', () => {
				const coupon = createCoupon({ minimum_amount: '50' });
				const result = validateCoupon(coupon, createContext({ cartSubtotal: 30 }));
				expect(result.valid).toBe(false);
				expect(result.error).toBe('Minimum spend of 50 not met.');
			});
		});

		// ---------------------------------------------------------------
		// Maximum amount
		// ---------------------------------------------------------------
		describe('maximum amount check', () => {
			it('should pass when no maximum is set', () => {
				const coupon = createCoupon({ maximum_amount: '' });
				const result = validateCoupon(coupon, createContext({ cartSubtotal: 99999 }));
				expect(result.valid).toBe(true);
			});

			it('should pass when maximum_amount is "0"', () => {
				const coupon = createCoupon({ maximum_amount: '0' });
				const result = validateCoupon(coupon, createContext({ cartSubtotal: 99999 }));
				expect(result.valid).toBe(true);
			});

			it('should pass when cart subtotal equals the maximum', () => {
				const coupon = createCoupon({ maximum_amount: '200' });
				const result = validateCoupon(coupon, createContext({ cartSubtotal: 200 }));
				expect(result.valid).toBe(true);
			});

			it('should pass when cart subtotal is below the maximum', () => {
				const coupon = createCoupon({ maximum_amount: '200' });
				const result = validateCoupon(coupon, createContext({ cartSubtotal: 100 }));
				expect(result.valid).toBe(true);
			});

			it('should fail when cart subtotal exceeds the maximum', () => {
				const coupon = createCoupon({ maximum_amount: '200' });
				const result = validateCoupon(coupon, createContext({ cartSubtotal: 250 }));
				expect(result.valid).toBe(false);
				expect(result.error).toBe('Maximum spend of 200 exceeded.');
			});
		});

		// ---------------------------------------------------------------
		// Individual use
		// ---------------------------------------------------------------
		describe('individual use check', () => {
			it('should pass when individual_use is false and other coupons exist', () => {
				const coupon = createCoupon({ individual_use: false });
				const context = createContext({ appliedCoupons: ['OTHER'] });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should pass when individual_use is true and no other coupons exist', () => {
				const coupon = createCoupon({ individual_use: true });
				const context = createContext({ appliedCoupons: [] });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should fail when individual_use is true and other coupons are applied', () => {
				const coupon = createCoupon({ code: 'SOLO', individual_use: true });
				const context = createContext({ appliedCoupons: ['FIRST'] });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(false);
				expect(result.error).toBe('This coupon cannot be used with other coupons.');
			});
		});

		// ---------------------------------------------------------------
		// Email restrictions
		// ---------------------------------------------------------------
		describe('email restriction check', () => {
			it('should pass when no email restrictions are set', () => {
				const coupon = createCoupon({ email_restrictions: [] });
				const result = validateCoupon(coupon, createContext());
				expect(result.valid).toBe(true);
			});

			it('should pass when customer email matches exactly', () => {
				const coupon = createCoupon({ email_restrictions: ['test@example.com'] });
				const context = createContext({ customerEmail: 'test@example.com' });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should pass with case-insensitive email match', () => {
				const coupon = createCoupon({ email_restrictions: ['Test@Example.COM'] });
				const context = createContext({ customerEmail: 'test@example.com' });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should pass with wildcard domain match', () => {
				const coupon = createCoupon({ email_restrictions: ['*@example.com'] });
				const context = createContext({ customerEmail: 'anyone@example.com' });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should pass when one of several restrictions matches', () => {
				const coupon = createCoupon({
					email_restrictions: ['vip@store.com', '*@example.com'],
				});
				const context = createContext({ customerEmail: 'test@example.com' });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should fail when email does not match any restriction', () => {
				const coupon = createCoupon({ email_restrictions: ['vip@store.com'] });
				const context = createContext({ customerEmail: 'test@example.com' });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(false);
				expect(result.error).toBe('This coupon is not valid for your email address.');
			});

			it('should fail when wildcard domain does not match', () => {
				const coupon = createCoupon({ email_restrictions: ['*@store.com'] });
				const context = createContext({ customerEmail: 'test@example.com' });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(false);
				expect(result.error).toBe('This coupon is not valid for your email address.');
			});

			it('should skip email check when no customer email is on the order', () => {
				const coupon = createCoupon({ email_restrictions: ['vip@store.com'] });
				const context = createContext({ customerEmail: '' });

				// Without an email we cannot validate, so let it pass
				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});
		});

		// ---------------------------------------------------------------
		// Exclude sale items
		// ---------------------------------------------------------------
		describe('exclude sale items check', () => {
			it('should pass when exclude_sale_items is false', () => {
				const coupon = createCoupon({ exclude_sale_items: false });
				const context = createContext({
					lineItems: [createItem({ on_sale: true })],
				});

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should pass when no items are on sale', () => {
				const coupon = createCoupon({ exclude_sale_items: true });
				const context = createContext({
					lineItems: [
						createItem({ product_id: 1, on_sale: false }),
						createItem({ product_id: 2, on_sale: false }),
					],
				});

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should fail when all items are on sale and exclude_sale_items is true', () => {
				const coupon = createCoupon({ exclude_sale_items: true });
				const context = createContext({
					lineItems: [
						createItem({ product_id: 1, on_sale: true }),
						createItem({ product_id: 2, on_sale: true }),
					],
				});

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(false);
				expect(result.error).toBe('This coupon is not applicable to items in your cart.');
			});

			it('should pass when some items are on sale but others are not', () => {
				const coupon = createCoupon({ exclude_sale_items: true });
				const context = createContext({
					lineItems: [
						createItem({ product_id: 1, on_sale: true }),
						createItem({ product_id: 2, on_sale: false }),
					],
				});

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});
		});

		// ---------------------------------------------------------------
		// Product / category restrictions
		// ---------------------------------------------------------------
		describe('product and category restriction checks', () => {
			it('should pass with no product or category restrictions', () => {
				const coupon = createCoupon();
				const result = validateCoupon(coupon, createContext());
				expect(result.valid).toBe(true);
			});

			it('should pass when a product matches product_ids', () => {
				const coupon = createCoupon({ product_ids: [1] });
				const context = createContext({
					lineItems: [createItem({ product_id: 1 }), createItem({ product_id: 2 })],
				});

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should fail when no products match product_ids', () => {
				const coupon = createCoupon({ product_ids: [99] });
				const context = createContext({
					lineItems: [createItem({ product_id: 1 }), createItem({ product_id: 2 })],
				});

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(false);
				expect(result.error).toBe('This coupon is not applicable to items in your cart.');
			});

			it('should fail when all items are in excluded_product_ids', () => {
				const coupon = createCoupon({ excluded_product_ids: [1, 2] });
				const context = createContext({
					lineItems: [createItem({ product_id: 1 }), createItem({ product_id: 2 })],
				});

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(false);
				expect(result.error).toBe('This coupon is not applicable to items in your cart.');
			});

			it('should pass when some items are excluded but others are eligible', () => {
				const coupon = createCoupon({ excluded_product_ids: [1] });
				const context = createContext({
					lineItems: [createItem({ product_id: 1 }), createItem({ product_id: 2 })],
				});

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should pass when items match a required category', () => {
				const coupon = createCoupon({ product_categories: [100] });
				const context = createContext({
					lineItems: [createItem({ categories: [{ id: 100 }] })],
				});

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});

			it('should fail when no items match required categories', () => {
				const coupon = createCoupon({ product_categories: [999] });
				const context = createContext({
					lineItems: [createItem({ categories: [{ id: 100 }] })],
				});

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(false);
				expect(result.error).toBe('This coupon is not applicable to items in your cart.');
			});

			it('should fail when all items belong to excluded categories', () => {
				const coupon = createCoupon({ excluded_product_categories: [100] });
				const context = createContext({
					lineItems: [
						createItem({ categories: [{ id: 100 }] }),
						createItem({ categories: [{ id: 100 }] }),
					],
				});

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(false);
				expect(result.error).toBe('This coupon is not applicable to items in your cart.');
			});

			it('should pass when some items are in excluded categories but others are not', () => {
				const coupon = createCoupon({ excluded_product_categories: [100] });
				const context = createContext({
					lineItems: [
						createItem({ categories: [{ id: 100 }] }),
						createItem({ categories: [{ id: 200 }] }),
					],
				});

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});
		});

		// ---------------------------------------------------------------
		// Valid coupon (happy path)
		// ---------------------------------------------------------------
		describe('valid coupon', () => {
			it('should return valid: true with no error for a fully valid coupon', () => {
				const coupon = createCoupon();
				const result = validateCoupon(coupon, createContext());

				expect(result).toEqual({ valid: true });
				expect(result.error).toBeUndefined();
			});

			it('should return valid: true for a coupon with future expiry and under limits', () => {
				const future = new Date(Date.now() + 86_400_000).toISOString();
				const coupon = createCoupon({
					date_expires_gmt: future,
					usage_limit: 100,
					usage_count: 5,
					minimum_amount: '10',
					maximum_amount: '500',
				});
				const context = createContext({ cartSubtotal: 200 });

				const result = validateCoupon(coupon, context);
				expect(result.valid).toBe(true);
			});
		});
	});
});
