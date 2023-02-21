import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import ItemizedTaxes from './itemized-taxes';
import useLocalData from '../../../../contexts/local-data';
import { t } from '../../../../lib/translations';
import useCurrencyFormat from '../../hooks/use-currency-format';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface Props {
	order: OrderDocument;
}

const Totals = ({ order }: Props) => {
	const { store } = useLocalData();
	const total = useObservableState(order.total$, order.total);
	const totalTax = useObservableState(order.total_tax$, order.total_tax);
	const taxTotalDisplay = useObservableState(store.tax_total_display$, store.tax_total_display);
	const { format } = useCurrencyFormat();
	const theme = useTheme();

	return (
		<Box
			padding="small"
			space="small"
			border
			style={{
				borderLeftWidth: 0,
				borderRightWidth: 0,
				borderColor: theme.colors.lightGrey,
				backgroundColor: theme.colors.lightestGrey,
			}}
		>
			<Box horizontal>
				<Box fill>
					<Text>{t('Subtotal', { _tags: 'core' })}:</Text>
				</Box>
				<Box>
					<Text>{format(total - totalTax || 0)}</Text>
				</Box>
			</Box>
			<Box space="xxSmall">
				{taxTotalDisplay === 'itemized' && <ItemizedTaxes order={order} />}
				<Box horizontal>
					<Box fill>
						<Text>{t('Total Tax', { _tags: 'core' })}:</Text>
					</Box>
					<Box>
						<Text>{format(totalTax || 0)}</Text>
					</Box>
				</Box>
			</Box>
		</Box>
	);
};

export default Totals;
