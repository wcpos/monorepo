import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { useT } from '../../../../contexts/translations';
import { useCurrentOrderCurrencyFormat } from '../../hooks/use-current-order-currency-format';

/**
 *
 */
const ItemizedTaxes = ({ taxLines = [], taxDisplayCart }) => {
	const { format } = useCurrentOrderCurrencyFormat();
	const t = useT();

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
										{taxDisplayCart} {tax.label}
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
};

export default ItemizedTaxes;
