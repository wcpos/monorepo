import * as React from 'react';

import find from 'lodash/find';

import Text from '@wcpos/components/src/text';

import useVariations from '../../../contexts/variations';
import VariablePriceWithTax from '../../../components/product/variable-price';

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
	 * @TODO - abstract this
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	return <VariablePriceWithTax variations={data} taxDisplay={show('tax') ? 'text' : 'tooltip'} />;
};
