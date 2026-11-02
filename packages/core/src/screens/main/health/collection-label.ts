/** A collection's name for people, as literal translation calls; an unknown one reads as itself. */
export function collectionLabel(name: string, t: (key: string) => string): string {
	const labels: Record<string, string> = {
		refunds: t('common.refunds'),
		orders: t('common.orders'),
		products: t('common.products'),
		variations: t('common.variations'),
		customers: t('common.customers'),
		taxRates: t('common.tax_rates'),
		categories: t('common.categories'),
		brands: t('common.brands'),
		tags: t('common.tags'),
		coupons: t('common.coupons'),
	};
	return labels[name] ?? name;
}
