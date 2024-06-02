import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { SelectWithLabel, SelectProps } from '@wcpos/components/src/select';

import { useExtraData } from '../contexts/extra-data';

export const OrderStatusSelect = (props: SelectProps) => {
	const { extraData } = useExtraData();
	const orderStatuses = useObservableEagerState(extraData.orderStatuses$);

	/**
	 *
	 */
	const options = React.useMemo(() => {
		return (orderStatuses || []).map((status) => ({
			label: status.label,
			value: status.status,
		}));
	}, [orderStatuses]);

	return <SelectWithLabel {...props} options={options} />;
};
