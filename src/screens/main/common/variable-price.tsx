import * as React from 'react';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import PriceWithTax from './price';

interface Props {
	variations: import('@wcpos/database').ProductVariationDocument[];
	taxDisplay: 'text' | 'tooltip' | 'none';
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
const VariablePrice = ({ variations, taxDisplay }: Props) => {
	// order variations by price, don't nutate the original array
	const sortedVariations = [...variations].sort((a, b) => a.price - b.price);
	const min = sortedVariations.shift();
	const max = sortedVariations.pop();

	if (min.price === max.price) {
		return (
			<PriceWithTax
				price={max.price}
				taxStatus={max.tax_status}
				taxClass={max.tax_class}
				taxDisplay={taxDisplay}
			/>
		);
	}

	return (
		<Box align="end">
			<PriceWithTax
				price={min.price}
				taxStatus={min.tax_status}
				taxClass={min.tax_class}
				taxDisplay={taxDisplay}
			/>
			<Text> - </Text>
			<PriceWithTax
				price={max.price}
				taxStatus={max.tax_status}
				taxClass={max.tax_class}
				taxDisplay={taxDisplay}
			/>
		</Box>
	);
};

export default VariablePrice;
