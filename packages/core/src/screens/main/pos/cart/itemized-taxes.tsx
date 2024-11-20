import * as React from 'react';

import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import { useCurrentOrderCurrencyFormat } from '../../hooks/use-current-order-currency-format';

/**
 *
 */
const ItemizedTaxes = ({ taxLines = [], taxDisplayCart }) => {
	const { format } = useCurrentOrderCurrencyFormat();
	const t = useT();

	return (
		<HStack>
			<Text>{t('Taxes', { _tags: 'core' })}:</Text>
			<VStack space="xs" className="flex-1">
				{taxLines.map((tax) => {
					// tax_total and shipping_tax_total are separate, but we will display together
					const displayTax = parseFloat(tax.tax_total) + parseFloat(tax.shipping_tax_total);
					return (
						<HStack key={tax.rate_id}>
							<Text className="flex-1 text-right">
								{taxDisplayCart} {tax.label}
							</Text>
							<Text>{format(displayTax || 0)}</Text>
						</HStack>
					);
				})}
			</VStack>
		</HStack>
	);
};

export default ItemizedTaxes;
