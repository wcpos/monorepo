import type { OrderDocument, TaxRateDocument } from '@wcpos/database';

import type {
	CouponLineInput,
	FeeLineInput,
	LineItemInput,
	ShippingLineInput,
	TaxRateInput,
} from './types';

type DbLineItem = NonNullable<OrderDocument['line_items']>[number];
type DbFeeLine = NonNullable<OrderDocument['fee_lines']>[number];
type DbShippingLine = NonNullable<OrderDocument['shipping_lines']>[number];
type DbCouponLine = NonNullable<OrderDocument['coupon_lines']>[number];

// If any of these stop compiling, the DB schema and the engine inputs have drifted.
const _l: LineItemInput = {} as DbLineItem;
const _f: FeeLineInput = {} as DbFeeLine;
const _s: ShippingLineInput = {} as DbShippingLine;
const _c: CouponLineInput = {} as DbCouponLine;
const _r: TaxRateInput = {} as TaxRateDocument;

test('structural inputs accept database document fragments', () => {
	expect([_l, _f, _s, _c, _r]).toBeDefined();
});
