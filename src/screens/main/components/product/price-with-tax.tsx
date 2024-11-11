import * as React from 'react';

import toNumber from 'lodash/toNumber';

import { cn } from '@wcpos/components/src/lib/utils';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/src/tooltip';
import { VStack } from '@wcpos/components/src/vstack';

import { useTaxRates } from '../../contexts/tax-rates';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useTaxDisplayValues } from '../../hooks/use-tax-display-values';

interface Props {
	price: string;
	taxStatus: 'taxable' | 'shipping' | 'none';
	taxClass: string;
	taxDisplay: 'text' | 'tooltip' | 'none';
	strikethrough?: boolean;
}

export const PriceWithTax = ({
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
		amount: toNumber(price),
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
					<Text className={cn(strikethrough && 'line-through text-muted-foreground', 'text-right')}>
						{format(displayValue)}
					</Text>
				</TooltipTrigger>
				<TooltipContent>
					<Text>{`${inclOrExcl} ${format(taxTotal)} tax`}</Text>
				</TooltipContent>
			</Tooltip>
		);
	}

	/**
	 * Show price and tax
	 */
	if (taxDisplay === 'text' && taxable) {
		return (
			<VStack className="items-end gap-1">
				<Text className={cn(strikethrough && 'line-through text-muted-foreground', 'text-right')}>
					{format(displayValue)}
				</Text>
				<Text
					className={cn(
						strikethrough && 'line-through',
						'text-sm text-right text-muted-foreground'
					)}
				>{`${inclOrExcl} ${format(taxTotal)} tax`}</Text>
			</VStack>
		);
	}

	// default just show the displayPrice
	return (
		<Text className={cn(strikethrough && 'line-through text-muted-foreground', 'text-right')}>
			{format(displayValue)}
		</Text>
	);
};
