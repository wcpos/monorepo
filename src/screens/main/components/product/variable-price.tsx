import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useDataTable } from '@wcpos/components/src/data-table';
import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import { PriceWithTax } from './price-with-tax';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

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
export const VariableProductPrice = ({
	row,
	column,
}: CellContext<{ document: ProductDocument }, 'price' | 'regular_price' | 'sale_price'>) => {
	const product = row.original.document;
	const taxStatus = useObservableState(product.tax_status$, product.tax_status);
	const taxClass = useObservableState(product.tax_class$, product.tax_class);
	const context = useDataTable();

	const metaData = useObservableState(product.meta_data$, product.meta_data);
	const variablePrices = getVariablePrices(metaData);

	/**
	 * No variable prices found?!
	 */
	if (variablePrices && !variablePrices[column.id]) {
		return null;
	}

	// min and max exist by are equal
	if (variablePrices[column.id].min === variablePrices[column.id].max) {
		return (
			<PriceWithTax
				price={variablePrices[column.id].max}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={column.columnDef.meta.show('tax') ? 'text' : 'tooltip'}
				taxLocation={context?.taxLocation}
			/>
		);
	}

	// default, min and max are different
	return (
		<HStack className="flex-wrap gap-1 justify-end">
			<PriceWithTax
				price={variablePrices[column.id].min}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={column.columnDef.meta.show('tax') ? 'text' : 'tooltip'}
				taxLocation={context?.taxLocation}
			/>
			<Text> - </Text>
			<PriceWithTax
				price={variablePrices[column.id].max}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={column.columnDef.meta.show('tax') ? 'text' : 'tooltip'}
				taxLocation={context?.taxLocation}
			/>
		</HStack>
	);
};
