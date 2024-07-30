import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { SelectWithLabel, SelectProps } from '@wcpos/components/src/select';

import { useExtraData } from '../contexts/extra-data';

export const TaxClassSelect = (props: SelectProps) => {
	const { extraData } = useExtraData();
	const taxClasses = useObservableEagerState(extraData.taxClasses$);

	/**
	 * @NOTE: Because the WC REST API is trash, it won't accept 'standard' as a tax class,
	 * so we need to send an empty string instead.
	 */
	const options = React.useMemo(() => {
		return (taxClasses || []).map((taxClass) => ({
			label: taxClass.name,
			value: taxClass.slug === 'standard' ? '' : taxClass.slug,
		}));
	}, [taxClasses]);

	return <SelectWithLabel {...props} options={options} />;
};
