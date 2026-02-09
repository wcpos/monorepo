import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { useCurrentOrderCurrencyFormat } from '../../hooks/use-current-order-currency-format';

/**
 *
 */
type TaxLine = NonNullable<import('@wcpos/database').OrderDocument['tax_lines']>[number];

const ItemizedTaxes = ({
	taxLines = [],
	taxDisplayCart,
}: {
	taxLines?: TaxLine[];
	taxDisplayCart: string;
}) => {
	const { format } = useCurrentOrderCurrencyFormat();
	const t = useT();

	return (
		<HStack>
			<Text>{t('common.taxes')}:</Text>
			<VStack space="xs" className="flex-1">
				{taxLines.map((tax) => {
					// tax_total and shipping_tax_total are separate, but we will display together
					const displayTax =
						parseFloat(tax.tax_total ?? '0') + parseFloat(tax.shipping_tax_total ?? '0');
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
