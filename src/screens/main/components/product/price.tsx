import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import Tooltip from '@wcpos/components/src/tooltip';

import { useTaxRates } from '../../contexts/tax-rates';
import { useTaxDisplayValues } from '../../hooks/taxes/use-tax-display-values';
import useCurrencyFormat from '../../hooks/use-currency-format';

interface Props {
	price: string;
	taxStatus: 'taxable' | 'none';
	taxClass: string;
	taxDisplay: 'text' | 'tooltip' | 'none';
	strikethrough?: boolean;
}

export const Price = ({
	price,
	taxStatus,
	taxClass,
	taxDisplay = 'tooltip',
	strikethrough,
}: Props) => {
	const { format } = useCurrencyFormat();
	const { calcTaxes } = useTaxRates();
	const taxable = taxStatus === 'taxable' && calcTaxes;
	const { displayValue, taxTotal, inclOrExcl } = useTaxDisplayValues({
		value: price,
		taxClass,
		taxStatus,
		context: 'shop',
	});

	/**
	 * Show price with tax available as tooltip
	 */
	if (taxDisplay === 'tooltip' && taxable) {
		return (
			<Tooltip content={`${inclOrExcl} ${format(taxTotal)} tax`}>
				<Text
					style={
						strikethrough
							? { textDecorationLine: 'line-through', textDecorationStyle: 'solid' }
							: {}
					}
					type={strikethrough ? 'secondary' : undefined}
				>
					{format(displayValue)}
				</Text>
			</Tooltip>
		);
	}

	/**
	 * Show price and tax
	 */
	if (taxDisplay === 'text' && taxable) {
		return (
			<Box space="xSmall" align="end">
				<Text
					style={
						strikethrough
							? { textDecorationLine: 'line-through', textDecorationStyle: 'solid' }
							: {}
					}
					type={strikethrough ? 'textMuted' : undefined}
				>
					{format(displayValue)}
				</Text>
				<Text type="textMuted" size="small">
					{`${inclOrExcl} ${format(taxTotal)} tax`}
				</Text>
			</Box>
		);
	}

	// default just show the displayPrice
	return <Text>{format(displayValue)}</Text>;
};

export default Price;
