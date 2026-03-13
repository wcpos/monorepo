/**
 * @jest-environment node
 *
 * Tests for coupon eligible item filtering logic.
 *
 * getEligibleItems mirrors WooCommerce's coupon product/category restriction
 * checks. It decides which cart line items a coupon can actually apply to.
 */
import {
	applyPerItemDiscountsToLineItems,
	computeDiscountedLineItems,
	convertDiscountsToExTax,
	type CouponLineItem,
	type CouponRestrictions,
	getEligibleItems,
	isProductOnSale,
} from './coupon-helpers';

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
	describe('isProductOnSale', () => {
		it('should return false for null product', () => {
			expect(isProductOnSale(null)).toBe(false);
		});

		it('should return false for undefined product', () => {
			expect(isProductOnSale(undefined)).toBe(false);
		});

		it('should return true when price is less than regular_price', () => {
			expect(isProductOnSale({ price: '10', regular_price: '20' })).toBe(true);
		});

		it('should return false when price equals regular_price', () => {
			expect(isProductOnSale({ price: '20', regular_price: '20' })).toBe(false);
		});

		it('should return false when price is greater than regular_price', () => {
			expect(isProductOnSale({ price: '25', regular_price: '20' })).toBe(false);
		});

		it('should return false when price is null', () => {
			expect(isProductOnSale({ price: null, regular_price: '20' })).toBe(false);
		});

		it('should return false when regular_price is null', () => {
			expect(isProductOnSale({ price: '10', regular_price: null })).toBe(false);
		});

		it('should return false when both prices are null', () => {
			expect(isProductOnSale({ price: null, regular_price: null })).toBe(false);
		});

		it('should return false when regular_price is "0"', () => {
			expect(isProductOnSale({ price: '0', regular_price: '0' })).toBe(false);
		});

		it('should return false when regular_price is empty string', () => {
			expect(isProductOnSale({ price: '10', regular_price: '' })).toBe(false);
		});

		it('should return false when price is undefined', () => {
			expect(isProductOnSale({ regular_price: '20' })).toBe(false);
		});
	});

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
					createItem({
						product_id: 1,
						categories: [{ id: 100 }],
						on_sale: false,
					}),
					createItem({
						product_id: 2,
						categories: [{ id: 100 }],
						on_sale: true,
					}),
					createItem({
						product_id: 3,
						categories: [{ id: 200 }],
						on_sale: false,
					}),
					createItem({
						product_id: 4,
						categories: [{ id: 100 }],
						on_sale: false,
					}),
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
					createItem({
						product_id: 10,
						categories: [{ id: 1 }, { id: 2 }],
						on_sale: false,
					}),
					createItem({
						product_id: 20,
						categories: [{ id: 1 }],
						on_sale: true,
					}),
					createItem({
						product_id: 30,
						categories: [{ id: 3 }],
						on_sale: false,
					}),
					createItem({
						product_id: 40,
						categories: [{ id: 1 }],
						on_sale: false,
					}),
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

			it('should exclude item when it has both an included and excluded category', () => {
				const items = [createItem({ product_id: 1, categories: [{ id: 100 }, { id: 200 }] })];
				const restrictions: CouponRestrictions = {
					product_ids: [],
					excluded_product_ids: [],
					product_categories: [100],
					excluded_product_categories: [200],
					exclude_sale_items: false,
				};

				// Item is in required category 100 BUT also in excluded category 200 — excluded wins
				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(0);
			});

			it('should exclude item with empty categories when category inclusion is required', () => {
				const items = [createItem({ product_id: 1, categories: [] })];
				const restrictions: CouponRestrictions = {
					product_ids: [],
					excluded_product_ids: [],
					product_categories: [100],
					excluded_product_categories: [],
					exclude_sale_items: false,
				};

				const result = getEligibleItems(items, restrictions);
				expect(result).toHaveLength(0);
			});

			it('should include all items when none are on sale and exclude_sale_items is true', () => {
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
		});
	});
});

describe('computeDiscountedLineItems', () => {
	it('applies a single coupon discount to a line item', () => {
		const lineItems = [
			{
				product_id: 63,
				total: '40.909091',
				total_tax: '4.090909',
				subtotal: '40.909091',
				subtotal_tax: '4.090909',
				taxes: [{ id: 4, subtotal: '4.090909', total: '4.090909' }],
			},
		];

		const result = computeDiscountedLineItems(lineItems, [
			[{ product_id: 63, discount: 12.272727 }],
		]);

		expect(parseFloat(result[0].total!)).toBeCloseTo(28.636364, 4);
		expect(parseFloat(result[0].total_tax!)).toBeCloseTo(2.863636, 4);
		// Total + tax should be ~31.50
		expect(parseFloat(result[0].total!) + parseFloat(result[0].total_tax!)).toBeCloseTo(31.5, 2);
	});

	it('returns items unchanged when no discounts apply', () => {
		const lineItems = [{ product_id: 1, total: '50', total_tax: '5', taxes: [] }];

		const result = computeDiscountedLineItems(lineItems, []);
		expect(result).toBe(lineItems);
	});

	it('skips items with null product_id', () => {
		const lineItems = [{ product_id: null, total: '50', total_tax: '5', taxes: [] }];

		const result = computeDiscountedLineItems(lineItems, [[{ product_id: 1, discount: 10 }]]);

		expect(result[0].total).toBe('50');
	});

	it('distributes discount proportionally across same-product line items', () => {
		const lineItems = [
			{ product_id: 1, total: '30', total_tax: '3', taxes: [] },
			{ product_id: 1, total: '70', total_tax: '7', taxes: [] },
		];

		const result = computeDiscountedLineItems(lineItems, [[{ product_id: 1, discount: 10 }]]);

		// 30% of discount goes to first item, 70% to second
		expect(parseFloat(result[0].total!)).toBeCloseTo(27, 4);
		expect(parseFloat(result[1].total!)).toBeCloseTo(63, 4);
	});

	it('caps discount so total never goes below zero', () => {
		const lineItems = [{ product_id: 1, total: '5', total_tax: '0.5', taxes: [] }];

		const result = computeDiscountedLineItems(lineItems, [[{ product_id: 1, discount: 100 }]]);

		expect(parseFloat(result[0].total!)).toBe(0);
		expect(parseFloat(result[0].total_tax!)).toBe(0);
	});

	it('aggregates discounts from multiple coupons', () => {
		const lineItems = [{ product_id: 1, total: '100', total_tax: '10', taxes: [] }];

		const result = computeDiscountedLineItems(lineItems, [
			[{ product_id: 1, discount: 20 }],
			[{ product_id: 1, discount: 10 }],
		]);

		expect(parseFloat(result[0].total!)).toBeCloseTo(70, 4);
		expect(parseFloat(result[0].total_tax!)).toBeCloseTo(7, 4);
	});

	it('updates per-rate taxes proportionally', () => {
		const lineItems = [
			{
				product_id: 1,
				total: '100',
				total_tax: '15',
				taxes: [
					{ id: 1, subtotal: '10', total: '10' },
					{ id: 2, subtotal: '5', total: '5' },
				],
			},
		];

		const result = computeDiscountedLineItems(lineItems, [[{ product_id: 1, discount: 50 }]]);

		// 50% discount → taxes halved
		expect(parseFloat(result[0].taxes![0].total!)).toBeCloseTo(5, 4);
		expect(parseFloat(result[0].taxes![1].total!)).toBeCloseTo(2.5, 4);
	});
});

describe('applyPerItemDiscountsToLineItems', () => {
	it('subtracts discount from matching item price', () => {
		const items: CouponLineItem[] = [
			createItem({ product_id: 1, quantity: 2, price: 10, subtotal: '20', total: '20' }),
		];
		const result = applyPerItemDiscountsToLineItems(items, [{ product_id: 1, discount: 6 }]);
		// 6 discount spread over 2 units -> price reduced by 3 per unit
		expect(result[0].price).toBeCloseTo(7, 4);
	});

	it('subtracts discount directly from price (ex-tax discounts)', () => {
		const items: CouponLineItem[] = [
			createItem({
				product_id: 1,
				quantity: 1,
				price: 16.363636,
				subtotal: '16.363636',
				total: '16.363636',
			}),
		];
		const result = applyPerItemDiscountsToLineItems(items, [{ product_id: 1, discount: 3 }]);
		// discount applied directly: 16.363636 - 3 = 13.363636
		expect(result[0].price).toBeCloseTo(13.363636, 4);
	});
});

describe('convertDiscountsToExTax', () => {
	it('converts fixed_cart discount from inc-tax to ex-tax', () => {
		// $3 inc 10% tax → ex-tax = 3 / 1.10 = 2.727273
		const perItem = [{ product_id: 1, discount: 3 }];
		const lineItems = [{ product_id: 1, subtotal: '16.363636', subtotal_tax: '1.636364' }];

		const result = convertDiscountsToExTax(perItem, lineItems, 'fixed_cart', true);

		expect(result[0].discount).toBeCloseTo(2.727273, 4);
	});

	it('converts fixed_product discount from inc-tax to ex-tax', () => {
		const perItem = [{ product_id: 1, discount: 5 }];
		const lineItems = [{ product_id: 1, subtotal: '20', subtotal_tax: '2' }];

		const result = convertDiscountsToExTax(perItem, lineItems, 'fixed_product', true);

		// 5 / 1.10 = 4.545455
		expect(result[0].discount).toBeCloseTo(4.545455, 4);
	});

	it('does NOT convert percent discounts (already ex-tax)', () => {
		const perItem = [{ product_id: 1, discount: 10 }];
		const lineItems = [{ product_id: 1, subtotal: '20', subtotal_tax: '2' }];

		const result = convertDiscountsToExTax(perItem, lineItems, 'percent', true);

		// Should be unchanged
		expect(result[0].discount).toBe(10);
	});

	it('returns discounts unchanged when pricesIncludeTax is false', () => {
		const perItem = [{ product_id: 1, discount: 3 }];
		const lineItems = [{ product_id: 1, subtotal: '16.363636', subtotal_tax: '1.636364' }];

		const result = convertDiscountsToExTax(perItem, lineItems, 'fixed_cart', false);

		expect(result[0].discount).toBe(3);
	});

	it('handles zero-tax items (no conversion needed)', () => {
		const perItem = [{ product_id: 1, discount: 5 }];
		const lineItems = [{ product_id: 1, subtotal: '20', subtotal_tax: '0' }];

		const result = convertDiscountsToExTax(perItem, lineItems, 'fixed_cart', true);

		// No tax rate → discount unchanged
		expect(result[0].discount).toBe(5);
	});

	it('handles multiple items with different tax rates', () => {
		const perItem = [
			{ product_id: 1, discount: 5 },
			{ product_id: 2, discount: 3 },
		];
		const lineItems = [
			{ product_id: 1, subtotal: '20', subtotal_tax: '2' }, // 10% tax
			{ product_id: 2, subtotal: '10', subtotal_tax: '1.5' }, // 15% tax
		];

		const result = convertDiscountsToExTax(perItem, lineItems, 'fixed_cart', true);

		expect(result[0].discount).toBeCloseTo(4.545455, 4); // 5 / 1.10
		expect(result[1].discount).toBeCloseTo(2.608696, 4); // 3 / 1.15
	});
});
