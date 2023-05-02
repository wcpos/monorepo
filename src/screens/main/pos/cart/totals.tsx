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
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const calcTaxes = useObservableState(store.calc_taxes$, store.calc_taxes);
	const { cartTotalsResource } = useCart();
	const {
		discount_total,
		shipping_total,
		tax_lines,
		total_tax,
		subtotal,
		subtotal_tax,
		fee_total,
	} = useObservableSuspense(cartTotalsResource);
	const { format } = useCurrencyFormat();
	const theme = useTheme();

	const hasSubtotal = parseFloat(subtotal) !== 0;
	const hasDiscount = parseFloat(discount_total) !== 0;
	const hasShipping = parseFloat(shipping_total) !== 0;
	const hasFee = parseFloat(fee_total) !== 0;
	const hasTax = parseFloat(total_tax) !== 0;
	const hasTotals = hasSubtotal || hasDiscount || hasShipping || hasFee || hasTax;

	const displaySubtotal =
		taxDisplayCart === 'incl' ? parseFloat(subtotal) + parseFloat(subtotal_tax) : subtotal;

	return hasTotals ? (
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
					<Text>{format(displaySubtotal)}</Text>
				</Box>
			</Box>
			{
				// Discounts
				hasDiscount && (
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
				hasFee && (
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
				hasShipping && (
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
			{calcTaxes === 'yes' && hasTax ? (
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
	) : null;
};

export default Totals;
