import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import PriceWithTax from './price';

interface Props {
	variations: import('@wcpos/database').ProductVariationDocument[];
	taxDisplay: 'text' | 'tooltip' | 'none';
	propertyName: 'price' | 'regular_price' | 'sale_price';
}

/**
 * Price range for variable products is slightly tricky to calculate
 * Tax Status can be set at the variation level, so it may be possible that
 * the lowest price is not the actual lowest price with taxes
 *
 * I think for most cases it is just to deal with the price property and disregard
 * taxes, but this may change based on user feedback
 *
 * Also, prices should react to changes in variation properties, I'm not sure if
 * that will happen in this case
 */
const VariablePrice = ({ variations, taxDisplay, propertyName = 'price' }: Props) => {
	// order variations by price, don't nutate the original array
	const sortedVariations = [...variations]
		.filter((doc) => !!doc[propertyName])
		.sort((a, b) => a[propertyName] - b[propertyName]);
	const min = sortedVariations[0];
	const max = sortedVariations[sortedVariations.length - 1];

	// propertyName is undefined for all variations
	if (sortedVariations.length === 0) {
		return null;
	}

	// min and max exist by are equal
	if (min[propertyName] === max[propertyName]) {
		return (
			<PriceWithTax
				price={max[propertyName]}
				taxStatus={max.tax_status}
				taxClass={max.tax_class}
				taxDisplay={taxDisplay}
			/>
		);
	}

	// default, min and max are different
	return (
		<Box align="end">
			<PriceWithTax
				price={min[propertyName]}
				taxStatus={min.tax_status}
				taxClass={min.tax_class}
				taxDisplay={taxDisplay}
			/>
			<Text> - </Text>
			<PriceWithTax
				price={max[propertyName]}
				taxStatus={max.tax_status}
				taxClass={max.tax_class}
				taxDisplay={taxDisplay}
			/>
		</Box>
	);
};

export default VariablePrice;
