import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { PriceWithTax } from './price-with-tax';

const uiLogger = getLogger(['wcpos', 'ui', 'product']);

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
function getVariablePrices(metaData) {
	if (!metaData) {
		uiLogger.error('metaData is not defined', {
			context: {
				errorCode: ERROR_CODES.MISSING_REQUIRED_FIELD,
			},
		});
		return null;
	}

	const metaDataEntry = metaData.find((m) => m.key === '_woocommerce_pos_variable_prices');

	if (!metaDataEntry) {
		uiLogger.error("No '_woocommerce_pos_variable_prices' key found in metaData", {
			context: {
				errorCode: ERROR_CODES.MISSING_REQUIRED_FIELD,
			},
		});
		return null;
	}

	try {
		const variablePrices = JSON.parse(metaDataEntry.value);
		return variablePrices;
	} catch (error) {
		uiLogger.error("Unable to parse '_woocommerce_pos_variable_prices' value into JSON", {
			context: {
				errorCode: ERROR_CODES.INVALID_DATA_TYPE,
				value: metaDataEntry.value,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		return null;
	}
}

/**
 *
 */
export const VariableProductPrice = ({
	table,
	row,
	column,
}: CellContext<{ document: ProductDocument }, 'price' | 'regular_price' | 'sale_price'>) => {
	const product = row.original.document;
	const taxStatus = useObservableState(product.tax_status$, product.tax_status);
	const taxClass = useObservableState(product.tax_class$, product.tax_class);

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
			/>
		);
	}

	// default, min and max are different
	return (
		<HStack className="flex-wrap justify-end gap-1">
			<PriceWithTax
				price={variablePrices[column.id].min}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={column.columnDef.meta.show('tax') ? 'text' : 'tooltip'}
			/>
			<Text> - </Text>
			<PriceWithTax
				price={variablePrices[column.id].max}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={column.columnDef.meta.show('tax') ? 'text' : 'tooltip'}
			/>
		</HStack>
	);
};
