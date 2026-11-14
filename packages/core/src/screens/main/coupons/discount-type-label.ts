/** A discount type's short name, as literal translation calls; an unknown type reads as itself. */
export function discountTypeLabel(type: string, t: (key: string) => string): string {
	if (type === 'percent') return t('coupons.percent_short');
	if (type === 'fixed_cart') return t('coupons.fixed_cart_short');
	if (type === 'fixed_product') return t('coupons.fixed_product_short');
	return type;
}
