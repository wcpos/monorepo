import React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';
import { useTaxInclOrExcl } from '../../../hooks/use-tax-incl-or-excl';

interface Props {
	totalTax: string;
	taxLines: import('@wcpos/database').OrderDocument['tax_lines'];
}

/**
 *
 */
export const Taxes = ({ totalTax, taxLines = [] }: Props) => {
	const { store } = useAppState();
	const taxTotalDisplay = useObservableEagerState(store.tax_total_display$);
	const { format } = useCurrentOrderCurrencyFormat();
	const { inclOrExcl } = useTaxInclOrExcl({ context: 'cart' });
	const t = useT();

	if (taxTotalDisplay === 'itemized') {
		return (
			<HStack>
				<Text className="grow">{t('Taxes', { _tags: 'core' })}:</Text>
				<VStack>
					{taxLines.map((tax, index) => {
						// tax_total and shipping_tax_total are separate, but we will display together
						const displayTax = parseFloat(tax.tax_total) + parseFloat(tax.shipping_tax_total);
						return (
							<HStack key={index} className="justify-end">
								<Text className="text-xs text-muted-foreground">
									{inclOrExcl} {tax.label}
								</Text>
								<Text>{format(displayTax || 0)}</Text>
							</HStack>
						);
					})}
				</VStack>
			</HStack>
		);
	}

	return (
		<HStack>
			<Text className="grow">{t('Total Tax', { _tags: 'core' })}:</Text>
			<HStack>
				<Text className="text-xs text-muted-foreground">{inclOrExcl}</Text>
				<Text>{format(totalTax || 0)}</Text>
			</HStack>
		</HStack>
	);
};
