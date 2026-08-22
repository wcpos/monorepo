import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export function TaxBasedOnSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();

	/**
	 *
	 */
	const options = React.useMemo(
		() => [
			{
				value: 'shipping',
				label: t('common.customer_shipping_address'),
			},
			{ value: 'billing', label: t('common.customer_billing_address') },
			{ value: 'base', label: t('common.shop_base_address') },
		],
		[t]
	);

	/**
	 *
	 */

	/**
	 *
	 */
	return (
		<OptionSelect
			options={options}
			value={value?.value}
			onChange={(_nextValue, option) => onValueChange?.(option)}
			placeholder={t('common.select_tax_based_on')}
			fallbackLabel=""
			matchWidth
			{...props}
		/>
	);
}
