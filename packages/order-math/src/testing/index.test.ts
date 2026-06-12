import {
	makeCartConfig,
	makeCouponContext,
	makeCouponLine,
	makeFeeLine,
	makeLineItem,
	makeShippingLine,
	makeSnapshot,
} from './index';

describe('makeCartConfig', () => {
	it('returns a frozen, branded CartConfig with sensible defaults', () => {
		const cfg = makeCartConfig();
		expect(Object.isFrozen(cfg)).toBe(true);
		expect(cfg.dp).toBe(2);
		expect(cfg.calcTaxes).toBe(true);
		expect(cfg.pricesIncludeTax).toBe(false);
	});

	it('merges overrides', () => {
		const cfg = makeCartConfig({ dp: 4, pricesIncludeTax: true });
		expect(cfg.dp).toBe(4);
		expect(cfg.pricesIncludeTax).toBe(true);
	});
});

describe('makeSnapshot', () => {
	it('returns empty arrays by default', () => {
		const snap = makeSnapshot();
		expect(snap.line_items).toEqual([]);
		expect(snap.fee_lines).toEqual([]);
		expect(snap.shipping_lines).toEqual([]);
		expect(snap.coupon_lines).toEqual([]);
	});

	it('merges overrides', () => {
		const item = makeLineItem();
		const snap = makeSnapshot({ line_items: [item] });
		expect(snap.line_items).toHaveLength(1);
	});
});

describe('makeCouponContext', () => {
	it('returns empty maps by default', () => {
		const ctx = makeCouponContext();
		expect(ctx.coupons.size).toBe(0);
		expect(ctx.productCategories.size).toBe(0);
	});

	it('lowercases coupon codes as map keys', () => {
		const ctx = makeCouponContext({
			coupons: [
				{ code: 'SUMMER10', discount_type: 'percent', amount: '10' },
				{ code: 'FLAT5', discount_type: 'fixed_cart', amount: '5' },
			],
		});
		expect(ctx.coupons.has('summer10')).toBe(true);
		expect(ctx.coupons.has('flat5')).toBe(true);
		expect(ctx.coupons.has('SUMMER10')).toBe(false);
	});

	it('preserves the original CouponInput values', () => {
		const coupon = { code: 'TEST', discount_type: 'percent' as const, amount: '15' };
		const ctx = makeCouponContext({ coupons: [coupon] });
		expect(ctx.coupons.get('test')).toMatchObject({ code: 'TEST', amount: '15' });
	});
});

describe('makeLineItem', () => {
	it('has sensible defaults', () => {
		const item = makeLineItem();
		expect(item.product_id).toBe(1);
		expect(item.quantity).toBe(1);
		expect(item.subtotal).toBe('10');
		expect(item.total).toBe('10');
	});

	it('merges posData overrides into the JSON meta', () => {
		const item = makeLineItem({ posData: { price: '20', regular_price: '25' } });
		const posDataMeta = item.meta_data?.find((m) => m.key === '_woocommerce_pos_data');
		const parsed = JSON.parse(posDataMeta?.value ?? '{}');
		expect(parsed.price).toBe('20');
		expect(parsed.regular_price).toBe('25');
		expect(parsed.tax_status).toBe('taxable'); // default preserved
	});

	it('merges top-level overrides', () => {
		const item = makeLineItem({ product_id: 42, quantity: 3, subtotal: '30', total: '30' });
		expect(item.product_id).toBe(42);
		expect(item.quantity).toBe(3);
	});
});

describe('makeFeeLine', () => {
	it('has sensible defaults', () => {
		const fee = makeFeeLine();
		expect(fee.name).toBe('Fee');
		expect(fee.total).toBe('5');
		expect(fee.total_tax).toBe('0');
	});

	it('merges posData overrides', () => {
		const fee = makeFeeLine({ posData: { amount: 10, percent: true } });
		const posDataMeta = fee.meta_data?.find((m) => m.key === '_woocommerce_pos_data');
		const parsed = JSON.parse(posDataMeta?.value ?? '{}');
		expect(parsed.amount).toBe(10);
		expect(parsed.percent).toBe(true);
	});

	it('merges top-level overrides', () => {
		const fee = makeFeeLine({ name: 'Surcharge', total: '15' });
		expect(fee.name).toBe('Surcharge');
		expect(fee.total).toBe('15');
	});
});

describe('makeShippingLine', () => {
	it('has sensible defaults', () => {
		const shipping = makeShippingLine();
		expect(shipping.method_id).toBe('flat_rate');
		expect(shipping.method_title).toBe('Flat rate');
		expect(shipping.total).toBe('5');
	});

	it('merges posData overrides', () => {
		const shipping = makeShippingLine({ posData: { amount: 12 } });
		const posDataMeta = shipping.meta_data?.find((m) => m.key === '_woocommerce_pos_data');
		const parsed = JSON.parse(posDataMeta?.value ?? '{}');
		expect(parsed.amount).toBe(12);
	});

	it('merges top-level overrides', () => {
		const shipping = makeShippingLine({ method_id: 'free_shipping', total: '0' });
		expect(shipping.method_id).toBe('free_shipping');
		expect(shipping.total).toBe('0');
	});
});

describe('makeCouponLine', () => {
	it('has sensible defaults', () => {
		const coupon = makeCouponLine();
		expect(coupon.code).toBe('test-coupon');
		expect(coupon.discount).toBe('0');
		expect(coupon.discount_tax).toBe('0');
	});

	it('includes UUID metadata by default', () => {
		const coupon = makeCouponLine();
		const uuidMeta = coupon.meta_data?.find((m) => m.key === '_woocommerce_pos_uuid');
		expect(uuidMeta?.value).toBe('test-coupon-uuid-1');
	});

	it('merges top-level overrides', () => {
		const coupon = makeCouponLine({ code: 'xmas10', discount: '25.50' });
		expect(coupon.code).toBe('xmas10');
		expect(coupon.discount).toBe('25.50');
	});

	it('allows null code as tombstone', () => {
		const coupon = makeCouponLine({ code: null });
		expect(coupon.code).toBeNull();
	});
});
