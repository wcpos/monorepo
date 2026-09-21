import { createInstance } from 'i18next';

import en from '../../../../contexts/translations/locales/en/core.json';
import {
	mintQuickDiscountCode,
	quickDiscountCouponConfig,
	quickDiscountCouponInput,
	quickDiscountLabel,
	readQuickDiscountIntent,
} from './quick-discount';

const intent = { discount_type: 'percent' as const, amount: '10' };
const line = (value: unknown) => ({ meta_data: [{ key: '_wcpos_quick_discount', value }] });

it.each([intent, JSON.stringify(intent)])('reads a valid intent: %p', (value) => {
	expect(readQuickDiscountIntent(line(value))).toEqual(intent);
});
it.each([
	null,
	'{',
	{},
	[],
	{ ...intent, amount: '0' },
	{ ...intent, amount: '-1' },
	{ ...intent, amount: '101' },
	{ ...intent, amount: 'Infinity' },
	{ ...intent, amount: '10oops' },
	{ ...intent, amount: 10 },
	{ ...intent, discount_type: 'fixed_product' },
])('rejects invalid intent: %p', (value) => {
	expect(readQuickDiscountIntent(line(value))).toBeNull();
});
it('handles absent meta and normalizes decimals without rounding', () => {
	expect(readQuickDiscountIntent({})).toBeNull();
	expect(
		readQuickDiscountIntent(line({ discount_type: 'fixed_cart', amount: '0010.0100' }))
	).toEqual({ discount_type: 'fixed_cart', amount: '10.01' });
});
it('builds unrestricted, unlimited coupon input and replay config', () => {
	const config = {
		...intent,
		limit_usage_to_x_items: null,
		product_ids: [],
		excluded_product_ids: [],
		product_categories: [],
		excluded_product_categories: [],
		exclude_sale_items: false,
	};
	expect(quickDiscountCouponConfig(intent)).toEqual(config);
	expect(quickDiscountCouponInput('pos-discount', intent)).toEqual({
		...config,
		code: 'pos-discount',
		individual_use: false,
		free_shipping: false,
		date_expires_gmt: null,
		usage_limit: null,
		usage_count: 0,
		usage_limit_per_user: null,
		used_by: [],
		minimum_amount: '0',
		maximum_amount: '0',
		email_restrictions: [],
	});
});
it.each([
	[[], 'pos-discount'],
	[['pos-discount'], 'pos-discount-2'],
	[['pos-discount', 'pos-discount-2'], 'pos-discount-3'],
	[['pos-discount', 'pos-discount-3'], 'pos-discount-2'],
	[['POS-DISCOUNT'], 'pos-discount-2'],
])('mints the lowest unused code from %p', (codes, expected) => {
	expect(mintQuickDiscountCode(codes as string[])).toBe(expected);
});
it('labels both types through the real translation configuration', async () => {
	const i18n = createInstance();
	await i18n.init({
		lng: 'en',
		resources: { en: { translation: en } },
		keySeparator: false,
		interpolation: { prefix: '{', suffix: '}', escapeValue: false },
	});
	expect(quickDiscountLabel({ ...intent, amount: '10.00' }, i18n.t)).toBe('Discount (10%)');
	expect(quickDiscountLabel({ ...intent, discount_type: 'fixed_cart' }, i18n.t)).toBe('Discount');
});
