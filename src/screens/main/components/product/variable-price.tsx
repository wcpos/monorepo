import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import { Box } from '@wcpos/tailwind/src/box';
import { useTable } from '@wcpos/tailwind/src/table';
import { Text } from '@wcpos/tailwind/src/text';
import log from '@wcpos/utils/src/logger';

import PriceWithTax from './price';

interface Props {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/tailwind/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
}

/**
 *
 */
function getVariablePrices(metaData) {
	if (!metaData) {
		log.error('metaData is not defined');
		return null;
	}

	const metaDataEntry = metaData.find((m) => m.key === '_woocommerce_pos_variable_prices');

	if (!metaDataEntry) {
		log.error("No '_woocommerce_pos_variable_prices' key found in metaData");
		return null;
	}

	try {
		const variablePrices = JSON.parse(metaDataEntry.value);
		return variablePrices;
	} catch (error) {
		log.error("Unable to parse '_woocommerce_pos_variable_prices' value into JSON:", error);
		return null;
	}
}

/**
 *
 */
const VariablePrice = ({ item: product, column }: Props) => {
	const taxStatus = useObservableState(product.tax_status$, product.tax_status);
	const taxClass = useObservableState(product.tax_class$, product.tax_class);
	const { display } = column;
	const context = useTable();

	const metaData = useObservableState(product.meta_data$, product.meta_data);
	const variablePrices = getVariablePrices(metaData);

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
				taxLocation={context?.taxLocation}
			/>
		);
	}

	// default, min and max are different
	return (
		<Box className="justify-end">
			<PriceWithTax
				price={variablePrices[column.key].min}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={show('tax') ? 'text' : 'tooltip'}
				taxLocation={context?.taxLocation}
			/>
			<Text> - </Text>
			<PriceWithTax
				price={variablePrices[column.key].max}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={show('tax') ? 'text' : 'tooltip'}
				taxLocation={context?.taxLocation}
			/>
		</Box>
	);
};

export default VariablePrice;
