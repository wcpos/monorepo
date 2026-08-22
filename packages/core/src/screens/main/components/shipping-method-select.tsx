import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';
import { useDocField } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { useExtraData } from '../contexts/extra-data';

/**
 *
 */
export function ShippingMethodSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const { extraData } = useExtraData();
	const shippingMethods = useDocField(extraData, (value) => value.shippingMethods);
	const t = useT();

	/**
	 *
	 */
	const options = React.useMemo(() => {
		return ((shippingMethods as { id: string; title: string }[]) || []).map(
			(method: { id: string; title: string }) => ({
				label: method.title,
				value: method.id,
			})
		);
	}, [shippingMethods]);

	/**
	 *
	 */
	return (
		<OptionSelect
			options={options}
			value={value?.value}
			onChange={(_nextValue, option) => onValueChange?.(option)}
			placeholder={t('common.select_shipping_method')}
			fallbackLabel=""
			matchWidth
			{...props}
		/>
	);
}
