import * as React from 'react';

import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/src/tooltip';
import { VStack } from '@wcpos/components/src/vstack';

import { useTaxRates } from '../../contexts/tax-rates';
import { useTaxDisplayValues } from '../../hooks/taxes/use-tax-display-values';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

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
			<Tooltip>
				<TooltipTrigger>
					<Text className={strikethrough && 'line-through'}>
						{format(parseFloat(displayValue))}
					</Text>
				</TooltipTrigger>
				<TooltipContent>
					<Text>{`${inclOrExcl} ${format(parseFloat(taxTotal))} tax`}</Text>
				</TooltipContent>
			</Tooltip>
		);
	}

	/**
	 * Show price and tax
	 */
	if (taxDisplay === 'text' && taxable) {
		return (
			<VStack className="justify-end">
				<Text className={strikethrough && 'line-through'}>{format(parseFloat(displayValue))}</Text>
				<Text className="text-sm text-muted-foreground">{`${inclOrExcl} ${format(parseFloat(taxTotal))} tax`}</Text>
			</VStack>
		);
	}

	// default just show the displayPrice
	return <Text>{format(parseFloat(displayValue))}</Text>;
};

export default Price;
