import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../lib/translations';
import useCurrencyFormat from '../../hooks/use-currency-format';

/**
 *
 */
const ItemizedTaxes = ({ taxLines }) => {
	const { format } = useCurrencyFormat();

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
									<Text>{tax.label}</Text>
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
