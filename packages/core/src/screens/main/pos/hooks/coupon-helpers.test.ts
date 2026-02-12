/**
 * @jest-environment node
 *
 * Tests for coupon eligible item filtering logic.
 *
 * getEligibleItems mirrors WooCommerce's coupon product/category restriction
 * checks. It decides which cart line items a coupon can actually apply to.
 */
import { type CouponLineItem, type CouponRestrictions, getEligibleItems } from './coupon-helpers';

// Factory for building test line items
const createItem = (overrides: Partial<CouponLineItem> = {}): CouponLineItem => ({
	product_id: 1,
	quantity: 1,
	price: 10,
	subtotal: '10',
	total: '10',
	categories: [{ id: 100 }],
	on_sale: false,
	...overrides,
});

// Default restrictions with nothing set (everything passes)
const noRestrictions: CouponRestrictions = {
	product_ids: [],
	excluded_product_ids: [],
	product_categories: [],
	excluded_product_categories: [],
	exclude_sale_items: false,
};

describe('coupon-helpers', () => {
	describe('getEligibleItems', () => {
		describe('no restrictions', () => {
			it('should return all items when no restrictions are set', () => {
				const items = [createItem({ product_id: 1 }), createItem({ product_id: 2 })];
				const result = getEligibleItems(items, noRestrictions);
				expect(result).toHaveLength(2);
			});

			it('should return an empty array when given no items', () => {
				const result = getEligibleItems([], noRestrictions);
				expect(result).toEqual([]);
			});
		});

		describe('product_ids inclusion filter', () => {
			it('should include only items whose product_id is in the list', () => {
				const items = [
					createItem({ product_id: 1 }),
					createItem({ product_id: 2 }),
					createItem({ product_id: 3 }),
				];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					product_ids: [1, 3],
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(2);
				expect(result.map((i) => i.product_id)).toEqual([1, 3]);
			});

			it('should return empty when no items match the inclusion list', () => {
				const items = [createItem({ product_id: 5 })];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					product_ids: [1, 2],
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(0);
			});
		});

		describe('excluded_product_ids filter', () => {
			it('should exclude items whose product_id is in the exclusion list', () => {
				const items = [
					createItem({ product_id: 1 }),
					createItem({ product_id: 2 }),
					createItem({ product_id: 3 }),
				];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					excluded_product_ids: [2],
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(2);
				expect(result.map((i) => i.product_id)).toEqual([1, 3]);
			});

			it('should return empty when all items are excluded', () => {
				const items = [createItem({ product_id: 1 }), createItem({ product_id: 2 })];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					excluded_product_ids: [1, 2],
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(0);
			});
		});

		describe('product_categories inclusion filter', () => {
			it('should include items that belong to at least one required category', () => {
				const items = [
					createItem({ product_id: 1, categories: [{ id: 100 }] }),
					createItem({ product_id: 2, categories: [{ id: 200 }] }),
					createItem({ product_id: 3, categories: [{ id: 100 }, { id: 300 }] }),
				];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					product_categories: [100],
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(2);
				expect(result.map((i) => i.product_id)).toEqual([1, 3]);
			});

			it('should return empty when no items match any required category', () => {
				const items = [createItem({ product_id: 1, categories: [{ id: 200 }] })];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					product_categories: [100, 300],
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(0);
			});

			it('should handle items with multiple categories matching one required', () => {
				const items = [createItem({ product_id: 1, categories: [{ id: 50 }, { id: 100 }] })];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					product_categories: [100],
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(1);
			});
		});

		describe('excluded_product_categories filter', () => {
			it('should exclude items that belong to an excluded category', () => {
				const items = [
					createItem({ product_id: 1, categories: [{ id: 100 }] }),
					createItem({ product_id: 2, categories: [{ id: 200 }] }),
				];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					excluded_product_categories: [100],
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(1);
				expect(result[0].product_id).toBe(2);
			});

			it('should exclude items with any category in the exclusion list', () => {
				const items = [createItem({ product_id: 1, categories: [{ id: 50 }, { id: 100 }] })];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					excluded_product_categories: [100],
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(0);
			});

			it('should return all items when none belong to excluded categories', () => {
				const items = [
					createItem({ product_id: 1, categories: [{ id: 200 }] }),
					createItem({ product_id: 2, categories: [{ id: 300 }] }),
				];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					excluded_product_categories: [100],
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(2);
			});
		});

		describe('exclude_sale_items filter', () => {
			it('should exclude on-sale items when flag is set', () => {
				const items = [
					createItem({ product_id: 1, on_sale: true }),
					createItem({ product_id: 2, on_sale: false }),
				];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					exclude_sale_items: true,
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(1);
				expect(result[0].product_id).toBe(2);
			});

			it('should keep on-sale items when flag is false', () => {
				const items = [
					createItem({ product_id: 1, on_sale: true }),
					createItem({ product_id: 2, on_sale: false }),
				];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					exclude_sale_items: false,
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(2);
			});

			it('should return all items when none are on sale and flag is set', () => {
				const items = [
					createItem({ product_id: 1, on_sale: false }),
					createItem({ product_id: 2, on_sale: false }),
				];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					exclude_sale_items: true,
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(2);
			});

			it('should return empty when all items are on sale and flag is set', () => {
				const items = [
					createItem({ product_id: 1, on_sale: true }),
					createItem({ product_id: 2, on_sale: true }),
				];
				const restrictions: CouponRestrictions = {
					...noRestrictions,
					exclude_sale_items: true,
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(0);
			});
		});

		describe('combined restrictions', () => {
			it('should apply product inclusion and category exclusion together', () => {
				const items = [
					createItem({ product_id: 1, categories: [{ id: 100 }] }),
					createItem({ product_id: 2, categories: [{ id: 200 }] }),
					createItem({ product_id: 3, categories: [{ id: 100 }] }),
				];
				const restrictions: CouponRestrictions = {
					product_ids: [1, 2, 3],
					excluded_product_ids: [],
					product_categories: [],
					excluded_product_categories: [100],
					exclude_sale_items: false,
				};

				// All three match product_ids, but 1 and 3 are in excluded category 100
				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(1);
				expect(result[0].product_id).toBe(2);
			});

			it('should apply product exclusion, category inclusion, and sale exclusion', () => {
				const items = [
					createItem({ product_id: 1, categories: [{ id: 100 }], on_sale: false }),
					createItem({ product_id: 2, categories: [{ id: 100 }], on_sale: true }),
					createItem({ product_id: 3, categories: [{ id: 200 }], on_sale: false }),
					createItem({ product_id: 4, categories: [{ id: 100 }], on_sale: false }),
				];
				const restrictions: CouponRestrictions = {
					product_ids: [],
					excluded_product_ids: [4],
					product_categories: [100],
					excluded_product_categories: [],
					exclude_sale_items: true,
				};

				// Item 1: category 100, not on sale, not excluded -> pass
				// Item 2: category 100, on sale -> fail (sale exclusion)
				// Item 3: category 200 -> fail (not in required categories)
				// Item 4: excluded by product_id -> fail
				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(1);
				expect(result[0].product_id).toBe(1);
			});

			it('should apply all restriction types simultaneously', () => {
				const items = [
					createItem({ product_id: 10, categories: [{ id: 1 }, { id: 2 }], on_sale: false }),
					createItem({ product_id: 20, categories: [{ id: 1 }], on_sale: true }),
					createItem({ product_id: 30, categories: [{ id: 3 }], on_sale: false }),
					createItem({ product_id: 40, categories: [{ id: 1 }], on_sale: false }),
				];
				const restrictions: CouponRestrictions = {
					product_ids: [10, 20, 40],
					excluded_product_ids: [40],
					product_categories: [1],
					excluded_product_categories: [2],
					exclude_sale_items: true,
				};

				// Item 10: in product_ids, not excluded, in category 1 BUT also in excluded category 2 -> fail
				// Item 20: in product_ids, not excluded, in category 1, but on sale -> fail
				// Item 30: NOT in product_ids -> fail
				// Item 40: in product_ids, but excluded by excluded_product_ids -> fail
				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(0);
			});
		});
	});
});
