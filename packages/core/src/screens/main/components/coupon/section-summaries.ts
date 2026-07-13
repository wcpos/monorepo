type TFunction = (key: string, options?: Record<string, unknown>) => string;

export interface RestrictionValues {
	minimum_amount?: string;
	maximum_amount?: string;
	individual_use?: boolean;
	free_shipping?: boolean;
}

export interface UsageLimitValues {
	usage_limit?: number | null;
	usage_limit_per_user?: number | null;
	limit_usage_to_x_items?: number | null;
}

const SEPARATOR = ' · ';

const isLimitSet = (value: number | null | undefined): value is number =>
	typeof value === 'number' && value > 0;

export function hasRestrictions(v: RestrictionValues): boolean {
	return !!(v.minimum_amount || v.maximum_amount || v.individual_use || v.free_shipping);
}

export function hasUsageLimits(v: UsageLimitValues): boolean {
	return (
		isLimitSet(v.usage_limit) ||
		isLimitSet(v.usage_limit_per_user) ||
		isLimitSet(v.limit_usage_to_x_items)
	);
}

/**
 * Collapsed-header summary so nothing configured is ever invisible.
 */
export function restrictionsSummary(
	v: RestrictionValues,
	t: TFunction,
	formatAmount: (amount: string) => string
): string {
	const parts: string[] = [];
	if (v.minimum_amount)
		parts.push(t('coupons.min_summary', { amount: formatAmount(v.minimum_amount) }));
	if (v.maximum_amount)
		parts.push(t('coupons.max_summary', { amount: formatAmount(v.maximum_amount) }));
	if (v.individual_use) parts.push(t('coupons.cannot_be_combined'));
	if (v.free_shipping) parts.push(t('coupons.free_shipping'));
	return parts.length ? parts.join(SEPARATOR) : t('coupons.none');
}

export function usageLimitsSummary(v: UsageLimitValues, t: TFunction): string {
	const parts: string[] = [];
	if (isLimitSet(v.usage_limit)) parts.push(t('coupons.total_uses_summary', { n: v.usage_limit }));
	if (isLimitSet(v.usage_limit_per_user))
		parts.push(t('coupons.per_customer_summary', { n: v.usage_limit_per_user }));
	if (isLimitSet(v.limit_usage_to_x_items))
		parts.push(t('coupons.items_summary', { n: v.limit_usage_to_x_items }));
	return parts.length ? parts.join(SEPARATOR) : t('coupons.unlimited');
}
