import * as React from 'react';

import { useT } from '../../../contexts/translations';

/** Fixed lists for `FormSelect` and `FormSegmentedControl`: slug values, literal `t('…')` labels. */
export function useOptionLists() {
	const t = useT();
	return React.useMemo(
		() => ({
			currencyPositions: [
				{ value: 'left', label: t('common.left') },
				{ value: 'right', label: t('common.right') },
				{ value: 'left_space', label: t('common.left_with_space') },
				{ value: 'right_space', label: t('common.right_with_space') },
			],
			taxBasedOn: [
				{ value: 'shipping', label: t('common.customer_shipping_address') },
				{ value: 'billing', label: t('common.customer_billing_address') },
				{ value: 'base', label: t('common.shop_base_address') },
			],
			couponStatuses: [
				{ value: 'publish', label: t('coupons.active') },
				{ value: 'draft', label: t('coupons.draft') },
				{ value: 'pending', label: t('coupons.pending') },
			],
			productStatuses: [
				{ value: 'draft', label: t('common.draft') },
				{ value: 'pending', label: t('common.pending') },
				{ value: 'private', label: t('common.private') },
				{ value: 'publish', label: t('common.publish') },
			],
			taxStatus: [
				{ value: 'taxable', label: t('common.taxable') },
				{ value: 'none', label: t('common.none') },
			] as const,
			taxDisplay: [
				{ value: 'single', label: t('common.as_a_single_total') },
				{ value: 'itemized', label: t('common.itemized') },
			] as const,
			inclExcl: [
				{ value: 'incl', label: t('common.including_tax') },
				{ value: 'excl', label: t('common.excluding_tax') },
			] as const,
		}),
		[t]
	);
}
