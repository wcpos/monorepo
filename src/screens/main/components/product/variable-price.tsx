import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import PriceWithTax from './price';

interface Props {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
}

const VariablePrice = ({ item: product, column }: Props) => {
	const taxStatus = useObservableState(product.tax_status$, product.tax_status);
	const taxClass = useObservableState(product.tax_class$, product.tax_class);
	const { display } = column;

	const metaData = useObservableState(product.meta_data$, product.meta_data);
	const variablePrices = JSON.parse(
		metaData?.find((m) => m.key === '_woocommerce_pos_variable_prices')?.value
	);

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
	 * No variable prices found?!
	 */
	if (variablePrices && !variablePrices[column.key]) {
		return null;
	}

	// min and max exist by are equal
	if (variablePrices[column.key].min === variablePrices[column.key].max) {
		return (
			<PriceWithTax
				price={variablePrices[column.key].max}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={show('tax') ? 'text' : 'tooltip'}
			/>
		);
	}

	// default, min and max are different
	return (
		<Box align="end">
			<PriceWithTax
				price={variablePrices[column.key].min}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={show('tax') ? 'text' : 'tooltip'}
			/>
			<Text> - </Text>
			<PriceWithTax
				price={variablePrices[column.key].max}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={show('tax') ? 'text' : 'tooltip'}
			/>
		</Box>
	);
};

export default VariablePrice;
