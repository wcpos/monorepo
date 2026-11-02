import * as React from 'react';

import toNumber from 'lodash/toNumber';

import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { useTaxSettings } from '../../contexts/tax-rates';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useTaxDisplayValues } from '../../hooks/use-tax-display-values';

// "incl. 0,86 € tax" / "excl. 0,86 € tax": one translated sentence per side of the tax switch.
function taxLineText(t: ReturnType<typeof useT>, inclOrExcl: string, amount: string): string {
	return inclOrExcl === 'incl'
		? t('common.incl_tax_amount', { amount })
		: t('common.excl_tax_amount', { amount });
}

interface Props {
	price: string;
	taxStatus: 'taxable' | 'shipping' | 'none';
	taxClass: string;
	taxDisplay: 'text' | 'tooltip' | 'none';
	strikethrough?: boolean;
	/** Classes for the amount. */
	className?: string;
}

export function PriceWithTax({
	price,
	taxStatus,
	taxClass,
	taxDisplay = 'tooltip',
	strikethrough,
	className,
}: Props) {
	const t = useT();
	const { format } = useCurrencyFormat();
	const { calcTaxes } = useTaxSettings();
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
					<Text
						className={cn(
							strikethrough && 'text-muted-foreground line-through',
							'text-right',
							className
						)}
					>
						{format(displayValue)}
					</Text>
				</TooltipTrigger>
				<TooltipContent>
					<Text>{taxLineText(t, inclOrExcl, format(taxTotal))}</Text>
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
				<Text
					className={cn(
						strikethrough && 'text-muted-foreground line-through',
						'text-right',
						className
					)}
				>
					{format(displayValue)}
				</Text>
				<Text variant="key" className={cn(strikethrough && 'line-through', 'text-right')}>
					{taxLineText(t, inclOrExcl, format(taxTotal))}
				</Text>
			</VStack>
		);
	}

	// default just show the displayPrice
	return (
		<Text
			className={cn(strikethrough && 'text-muted-foreground line-through', 'text-right', className)}
		>
			{format(displayValue)}
		</Text>
	);
}

/**
 * The tax line on its own ("incl. 0,86 € tax"), for a row that places it after other words:
 * what `taxDisplay="text"` stacks under the amount. Nothing when the price is not taxed.
 */
export function TaxLine({
	price,
	taxStatus,
	taxClass,
	className,
}: Pick<Props, 'price' | 'taxStatus' | 'taxClass' | 'className'>) {
	const t = useT();
	const { format } = useCurrencyFormat();
	const { calcTaxes } = useTaxSettings();
	const { taxTotal, inclOrExcl } = useTaxDisplayValues({
		amount: toNumber(price),
		taxClass,
		taxStatus,
		context: 'shop',
	});
	if (taxStatus !== 'taxable' || !calcTaxes) return null;
	return <Text className={className}>{taxLineText(t, inclOrExcl, format(taxTotal))}</Text>;
}
