import * as React from 'react';

import find from 'lodash/find';

import Text from '@wcpos/components/src/text';

import { LoadingVariablePrice } from './loading-variations-price';
import VariablePriceWithTax from '../../../components/product/variable-price';
import useVariations from '../../../contexts/variations';

interface Props {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
}

export const VariablePrice = ({ item: product, column }: Props) => {
	const { data } = useVariations();
	const { display } = column;

	/**
	 * TODO - abstract this
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	/**
	 * TODO: I need to check whether all the variations have loaded
	 * NOTE: variations length can change here due to the variation query
	 */
	if (!Array.isArray(data) || data.length === 0) {
		return <LoadingVariablePrice />;
	}

	return <VariablePriceWithTax variations={data} taxDisplay={show('tax') ? 'text' : 'tooltip'} />;
};
