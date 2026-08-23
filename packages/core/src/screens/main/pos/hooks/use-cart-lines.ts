import * as React from 'react';

import { useRecordField } from '@wcpos/query';

import { useCurrentOrder } from '../contexts/current-order';

/**
 * The cart's line selector. PURE — it reads, it does not write.
 *
 * It is mounted three times on the cart surface (cart/table.tsx, cart/totals.tsx and
 * use-order-totals.ts), which is fine precisely because it holds no write state. The
 * settlement that used to live here moved to useCartSettlement for #1472, where a
 * single mount owns the single-flight guard and the re-push latch — three copies of
 * those meant three concurrent writes per cart edit.
 *
 * @NOTE - when current order is updated, eg: date_modified, the cart lines will re-subscribe.
 */
export const useCartLines = () => {
	const { currentOrderRecord } = useCurrentOrder();
	const lineItems = useRecordField(currentOrderRecord, (order) => order.payload.line_items);
	const feeLines = useRecordField(currentOrderRecord, (order) => order.payload.fee_lines);
	const shippingLines = useRecordField(currentOrderRecord, (order) => order.payload.shipping_lines);
	const couponLines = useRecordField(currentOrderRecord, (order) => order.payload.coupon_lines);

	/**
	 * We need to filter out any items that have been 'removed', eg: product_id === null.
	 */
	const cartLines = React.useMemo(() => {
		return {
			line_items: (lineItems || []).filter((item) => item.product_id !== null),
			fee_lines: (feeLines || []).filter((item) => item.name !== null),
			shipping_lines: (shippingLines || []).filter((item) => item.method_id !== null),
			coupon_lines: (couponLines || []).filter((item) => item.code != null),
		};
	}, [lineItems, feeLines, shippingLines, couponLines]);

	return cartLines;
};
