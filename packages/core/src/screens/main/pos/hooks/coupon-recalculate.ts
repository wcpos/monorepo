// Boundary adapter: narrows the pure coupon engine's structural types back to
// the RxDB document element types that core callers persist.
//
// The pure engine is typed against the package's structural input types
// (LineItemInput/CouponLineInput — supertypes of the DB element types, see
// types.assignability.test.ts). Legacy core callers persist the result back
// into RxDB documents, so this shim narrows the surface back to the DB
// element types at the boundary.
import { recalculateCoupons as pureRecalculateCoupons } from '@wcpos/order-math/internal';
import type { RecalculateInput as PureRecalculateInput } from '@wcpos/order-math/internal';

type LineItem = import('@wcpos/query').OrderLineItem;
type CouponLine = import('@wcpos/query').OrderCouponLine;

export interface RecalculateInput extends Omit<PureRecalculateInput, 'lineItems' | 'couponLines'> {
	lineItems: LineItem[];
	couponLines: CouponLine[];
}

export interface RecalculateResult {
	lineItems: LineItem[];
	couponLines: CouponLine[];
}

export const recalculateCoupons = (input: RecalculateInput): RecalculateResult =>
	pureRecalculateCoupons(input) as RecalculateResult;
