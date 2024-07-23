import React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { useTaxDisplay } from '../../../hooks/taxes/use-tax-display';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';

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
	const { inclOrExcl } = useTaxDisplay({ context: 'cart' });
	const t = useT();

	if (taxTotalDisplay === 'itemized') {
		return (
			<HStack>
				<Text className="grow">{t('Taxes', { _tags: 'core' })}:</Text>
				<VStack>
					{taxLines.map((tax) => {
						// tax_total and shipping_tax_total are separate, but we will display together
						const displayTax = parseFloat(tax.tax_total) + parseFloat(tax.shipping_tax_total);
						return (
							<HStack>
								<Text>
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
				<Text>{inclOrExcl}</Text>
				<Text>{format(totalTax || 0)}</Text>
			</HStack>
		</HStack>
	);
};
