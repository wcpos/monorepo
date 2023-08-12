import * as React from 'react';

import isEmpty from 'lodash/isEmpty';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import CustomerNote from './customer-note';
import ItemizedTaxes from './itemized-taxes';
import { useAppStateManager } from '../../../../contexts/app-state-manager';
import { t } from '../../../../lib/translations';
import { useCart } from '../../contexts/cart';
import useCurrencyFormat from '../../hooks/use-currency-format';
import useCurrentOrder from '../contexts/current-order';

const Totals = () => {
	const { currentOrder } = useCurrentOrder();
	const appState = useAppStateManager();
	const store = useObservableState(appState.store$, appState.store);
	const taxTotalDisplay = useObservableState(store.tax_total_display$, store.tax_total_display);
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const calcTaxes = useObservableState(store.calc_taxes$, store.calc_taxes);
	const customerNote = useObservableState(currentOrder.customer_note$, currentOrder.customer_note);
	const { cartTotalsResource } = useCart();
	const {
		discount_total,
		shipping_total,
		tax_lines,
		total_tax,
		subtotal,
		subtotal_tax,
		fee_total,
		shipping_tax,
		fee_tax,
		discount_tax,
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
	const displayDiscountTotal =
		taxDisplayCart === 'incl'
			? parseFloat(discount_total) + parseFloat(discount_tax)
			: discount_total;
	const displayFeeTotal =
		taxDisplayCart === 'incl' ? parseFloat(fee_total) + parseFloat(fee_tax) : fee_total;
	const displayShippingTotal =
		taxDisplayCart === 'incl'
			? parseFloat(shipping_total) + parseFloat(shipping_tax)
			: shipping_total;

	return (
		<>
			{' '}
			{hasTotals ? (
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
									<Text>{format(`-${displayDiscountTotal}`)}</Text>
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
									<Text>{format(displayFeeTotal)}</Text>
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
									<Text>{format(displayShippingTotal)}</Text>
								</Box>
							</Box>
						)
					}
					{calcTaxes === 'yes' && hasTax ? (
						taxTotalDisplay === 'itemized' ? (
							<ItemizedTaxes taxLines={tax_lines} taxDisplayCart={taxDisplayCart} />
						) : (
							<Box horizontal>
								<Box fill>
									<Text>{t('Total Tax', { _tags: 'core' })}:</Text>
								</Box>
								<Box horizontal space="normal">
									<Box fill align="end">
										<Text>{taxDisplayCart}.</Text>
									</Box>
									<Box>
										<Text>{format(total_tax || 0)}</Text>
									</Box>
								</Box>
							</Box>
						)
					) : null}
				</Box>
			) : null}
			{!isEmpty(customerNote) && (
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
					<CustomerNote note={customerNote} order={currentOrder} />
				</Box>
			)}
		</>
	);
};

export default Totals;
