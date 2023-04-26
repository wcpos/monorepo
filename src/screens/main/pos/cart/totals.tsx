import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import ItemizedTaxes from './itemized-taxes';
import useLocalData from '../../../../contexts/local-data';
import { t } from '../../../../lib/translations';
import useCart from '../../contexts/cart';
import useCurrencyFormat from '../../hooks/use-currency-format';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface Props {
	order: OrderDocument;
}

const Totals = ({ order }: Props) => {
	const { store } = useLocalData();
	const { cartTotals$ } = useCart();
	const cartTotals = useObservableState(cartTotals$, {
		subtotal: '0', // there is no subtotal in the order schema :(
		total_tax: order.total_tax,
		discount_total: order.discount_total,
		discount_tax: order.discount_tax,
	});
	const taxTotalDisplay = useObservableState(store.tax_total_display$, store.tax_total_display);
	const calcTaxes = useObservableState(store.calc_taxes$, store.calc_taxes);
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
					<Text>{format(cartTotals.subtotal || 0)}</Text>
				</Box>
			</Box>
			{parseFloat(cartTotals.discount_total) !== 0 && (
				<Box horizontal>
					<Box fill>
						<Text>{t('Discount', { _tags: 'core' })}:</Text>
					</Box>
					<Box>
						<Text>{format(cartTotals.discount_total || 0)}</Text>
					</Box>
				</Box>
			)}
			{calcTaxes === 'yes' && (
				<Box space="xxSmall">
					{taxTotalDisplay === 'itemized' && <ItemizedTaxes order={order} />}
					<Box horizontal>
						<Box fill>
							<Text>{t('Total Tax', { _tags: 'core' })}:</Text>
						</Box>
						<Box>
							<Text>{format(cartTotals.total_tax)}</Text>
						</Box>
					</Box>
				</Box>
			)}
		</Box>
	);
};

export default Totals;
