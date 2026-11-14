import * as React from 'react';

import { OptionSelect, type OptionSelectProps } from '@wcpos/components/select';
import { useDocField } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { useExtraData } from '../contexts/extra-data';

/**
 *
 */
export function ShippingMethodSelect(props: Omit<OptionSelectProps, 'options' | 'placeholder'>) {
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
		<OptionSelect options={options} placeholder={t('common.select_shipping_method')} {...props} />
	);
}
