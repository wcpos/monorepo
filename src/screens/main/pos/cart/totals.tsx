import * as React from 'react';

import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import ItemizedTaxes from './itemized-taxes';
import useLocalData from '../../../../contexts/local-data';
import { t } from '../../../../lib/translations';
import { useCart } from '../../contexts/cart';
import useCurrencyFormat from '../../hooks/use-currency-format';

const Totals = () => {
	const { store } = useLocalData();
	const taxTotalDisplay = useObservableState(store.tax_total_display$, store.tax_total_display);
	const calcTaxes = useObservableState(store.calc_taxes$, store.calc_taxes);
	const { cartTotalsResource } = useCart();
	const { discount_total, shipping_total, tax_lines, total_tax, subtotal, fee_total } =
		useObservableSuspense(cartTotalsResource);
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
					<Text>{format(subtotal)}</Text>
				</Box>
			</Box>
			{
				// Discounts
				parseFloat(discount_total) !== 0 && (
					<Box horizontal>
						<Box fill>
							<Text>{t('Discount', { _tags: 'core' })}:</Text>
						</Box>
						<Box>
							<Text>{format(`-${discount_total}`)}</Text>
						</Box>
					</Box>
				)
			}
			{
				// Fees
				parseFloat(fee_total) !== 0 && (
					<Box horizontal>
						<Box fill>
							<Text>{t('Fees', { _tags: 'core' })}:</Text>
						</Box>
						<Box>
							<Text>{format(fee_total)}</Text>
						</Box>
					</Box>
				)
			}
			{
				// Shipping
				parseFloat(shipping_total) !== 0 && (
					<Box horizontal>
						<Box fill>
							<Text>{t('Shipping', { _tags: 'core' })}:</Text>
						</Box>
						<Box>
							<Text>{format(shipping_total)}</Text>
						</Box>
					</Box>
				)
			}
			{calcTaxes === 'yes' && parseFloat(total_tax) !== 0 ? (
				taxTotalDisplay === 'itemized' ? (
					<ItemizedTaxes taxLines={tax_lines} />
				) : (
					<Box horizontal>
						<Box fill>
							<Text>{t('Total Tax', { _tags: 'core' })}:</Text>
						</Box>
						<Box>
							<Text>{format(total_tax)}</Text>
						</Box>
					</Box>
				)
			) : null}
		</Box>
	);
};

export default Totals;
