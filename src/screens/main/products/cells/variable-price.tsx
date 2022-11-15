import * as React from 'react';

import find from 'lodash/find';

import Text from '@wcpos/components/src/text';

import useVariations from '../../../../contexts/variations';
import VariablePriceWithTax from '../../common/variable-price';

interface Props {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
}

const VariablePrice = ({ item: product, column }: Props) => {
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

	const variationsSynced = React.useMemo(() => {
		return product.isSynced() && data.length > 0 && data.every((variation) => variation.isSynced());
	}, [product, data]);

	if (!variationsSynced) {
		<Text.Skeleton length="short" />;
	}

	return (
		<VariablePriceWithTax
			variations={data}
			taxDisplay={show('tax') ? 'text' : 'tooltip'}
			propertyName="price"
		/>
	);
};

export default VariablePrice;
