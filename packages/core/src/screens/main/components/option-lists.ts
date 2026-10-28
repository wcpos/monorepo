import * as React from 'react';

import { useT } from '../../../contexts/translations';

type Pairs = readonly (readonly [string, string])[];

export const CURRENCY_POSITIONS = [
	['left', 'common.left'],
	['right', 'common.right'],
	['left_space', 'common.left_with_space'],
	['right_space', 'common.right_with_space'],
] as const;
export const TAX_BASED_ON = [
	['shipping', 'common.customer_shipping_address'],
	['billing', 'common.customer_billing_address'],
	['base', 'common.shop_base_address'],
] as const;
export const COUPON_STATUSES = [
	['publish', 'coupons.active'],
	['draft', 'coupons.draft'],
	['pending', 'coupons.pending'],
] as const;
export const PRODUCT_STATUSES = [
	['draft', 'common.draft'],
	['pending', 'common.pending'],
	['private', 'common.private'],
	['publish', 'common.publish'],
] as const;

/** `[value, key]` pairs as `FormSelect` options: the value is the slug written, never translated. */
export function useOptionList(pairs: Pairs) {
	const t = useT();
	return React.useMemo(() => pairs.map(([value, key]) => ({ value, label: t(key) })), [pairs, t]);
}
