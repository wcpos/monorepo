import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { SelectWithLabel, SelectProps } from '@wcpos/components/src/select';

import { useExtraData } from '../contexts/extra-data';

export const ShippingMethodSelect = (props: SelectProps) => {
	const { extraData } = useExtraData();
	const shippingMethods = useObservableEagerState(extraData.shippingMethods$);

	/**
	 *
	 */
	const options = React.useMemo(() => {
		return (shippingMethods || []).map((method) => ({
			label: method.title,
			value: method.id,
		}));
	}, [shippingMethods]);

	return <SelectWithLabel {...props} options={options} />;
};
