import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../lib/translations';
import useCurrencyFormat from '../../hooks/use-currency-format';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface Props {
	order: OrderDocument;
}

const Totals = ({ order }: Props) => {
	const total = useObservableState(order.total$, order.total);
	const totalTax = useObservableState(order.total_tax$, order.total_tax);
	const { format } = useCurrencyFormat();
	const theme = useTheme();

	return (
		<Box
			border
			style={{
				borderLeftWidth: 0,
				borderRightWidth: 0,
				borderColor: theme.colors.lightGrey,
				backgroundColor: theme.colors.lightestGrey,
			}}
		>
			<Box horizontal>
				<Box fill padding="small">
					<Text>{t('Subtotal', { _tags: 'core' })}:</Text>
				</Box>
				<Box padding="small">
					<Text>{format(total - totalTax || 0)}</Text>
				</Box>
			</Box>
			<Box horizontal>
				<Box fill padding="small">
					<Text>{t('Total Tax', { _tags: 'core' })}:</Text>
				</Box>
				<Box padding="small">
					<Text>{format(totalTax || 0)}</Text>
				</Box>
			</Box>
		</Box>
	);
};

export default Totals;
