import { calculateOrderTotals } from './internal/order-totals';

import type { CartConfig } from './config';
import type { CartSnapshot } from './snapshot';

export type OrderTotals = ReturnType<typeof calculateOrderTotals>;

export function getOrderTotals(snapshot: CartSnapshot, config: CartConfig): OrderTotals {
	return calculateOrderTotals({
		lineItems: [...(snapshot.line_items ?? [])],
		feeLines: [...(snapshot.fee_lines ?? [])],
		shippingLines: [...(snapshot.shipping_lines ?? [])],
		couponLines: [...(snapshot.coupon_lines ?? [])],
		taxRates: [...config.allRates],
		taxRoundAtSubtotal: config.taxRoundAtSubtotal,
		dp: config.dp,
		pricesIncludeTax: config.pricesIncludeTax,
	});
}
