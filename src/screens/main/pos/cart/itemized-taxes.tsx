import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import useCurrencyFormat from '../../hooks/use-currency-format';

/**
 *
 */
const ItemizedTaxes = ({ order }) => {
	const { format } = useCurrencyFormat();
	const taxLines = useObservableState(order.tax_lines$, order.tax_lines);

	return taxLines.map((tax) => (
		<Box key={tax.rate_id} horizontal>
			<Box fill>
				<Text size="small">{tax.label}</Text>
			</Box>
			<Box>
				<Text size="small">{format(tax.tax_total || 0)}</Text>
			</Box>
		</Box>
	));
};

export default ItemizedTaxes;
