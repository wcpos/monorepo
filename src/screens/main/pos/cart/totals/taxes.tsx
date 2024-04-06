import React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

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
			<Box horizontal>
				<Box>
					<Text>{t('Taxes', { _tags: 'core' })}:</Text>
				</Box>
				<Box fill space="xxSmall">
					{taxLines.map((tax) => {
						// tax_total and shipping_tax_total are separate, but we will display together
						const displayTax = parseFloat(tax.tax_total) + parseFloat(tax.shipping_tax_total);
						return (
							<Box key={tax.rate_id}>
								<Box horizontal space="normal">
									<Box fill align="end">
										<Text>
											{inclOrExcl} {tax.label}
										</Text>
									</Box>
									<Box>
										<Text>{format(displayTax || 0)}</Text>
									</Box>
								</Box>
							</Box>
						);
					})}
				</Box>
			</Box>
		);
	}

	return (
		<Box horizontal>
			<Box fill>
				<Text>{t('Total Tax', { _tags: 'core' })}:</Text>
			</Box>
			<Box horizontal space="normal">
				<Box fill align="end">
					<Text>{inclOrExcl}</Text>
				</Box>
				<Box>
					<Text>{format(totalTax || 0)}</Text>
				</Box>
			</Box>
		</Box>
	);
};
