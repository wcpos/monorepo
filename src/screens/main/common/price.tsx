import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';
import useAuth from '@wcpos/hooks/src/use-auth';
import useTaxes from '@wcpos/core/src/contexts/taxes';
import Text from '@wcpos/components/src/text';
import Tooltip from '@wcpos/components/src/tooltip';
import Box from '@wcpos/components/src/box';

interface Props {
	price: string;
	taxStatus: string;
	taxClass: string;
	taxDisplay: 'text' | 'tooltip' | 'none';
}

export const Price = ({ price, taxStatus, taxClass, taxDisplay = 'tooltip' }: Props) => {
	const { format } = useCurrencyFormat();
	const { store } = useAuth();
	const taxDisplayShop = useObservableState(store?.tax_display_shop$, store?.tax_display_shop);
	const calcTaxes = useObservableState(store?.calc_taxes$, store?.calc_taxes);
	const taxable = taxStatus === 'taxable' && calcTaxes === 'yes';
	const { getDisplayValues } = useTaxes();

	let displayPrice = price;
	let taxTotal = 0;

	if (taxable) {
		const result = getDisplayValues(price, taxClass, taxDisplayShop);
		displayPrice = result.displayPrice;
		taxTotal = result.taxTotal;
	}

	/**
	 * Show price with tax available as tooltip
	 */
	if (taxDisplay === 'tooltip' && taxable) {
		return (
			<Tooltip content={`${taxDisplayShop === 'incl' ? 'incl.' : 'excl.'} ${format(taxTotal)} tax`}>
				<Text>{format(displayPrice)}</Text>
			</Tooltip>
		);
	}

	/**
	 * Show price and tax
	 */
	if (taxDisplay === 'text' && taxable) {
		return (
			<Box align="end">
				<Text>{format(displayPrice)}</Text>
				<Text type="textMuted" size="small">
					{`${taxDisplayShop === 'incl' ? 'incl.' : 'excl.'} ${format(taxTotal)} tax`}
				</Text>
			</Box>
		);
	}

	// default just show the displayPrice
	return <Text>{format(displayPrice)}</Text>;
};

export default Price;
