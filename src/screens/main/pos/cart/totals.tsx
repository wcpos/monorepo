import * as React from 'react';

import isEmpty from 'lodash/isEmpty';
import { BehaviorSubject } from 'rxjs';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import CustomerNote from './customer-note';
import ItemizedTaxes from './itemized-taxes';
import { useCartTotals } from './use-cart-totals';
import { useT } from '../../../../contexts/translations';
import useCurrencyFormat from '../../hooks/use-currency-format';
import { useCurrentOrder } from '../contexts/current-order';
import { useOrderTotals } from '../hooks/use-order-totals';

/**
 *
 */
const Totals = () => {
	const theme = useTheme();
	const t = useT();
	const { currentOrder } = useCurrentOrder();
	const { format } = useCurrencyFormat({ currencySymbol: currentOrder.currency_symbol });
	const totals = useOrderTotals();
	console.log('Cart Totals', totals);

	return null;

	// const {
	// 	tax_lines,
	// 	total_tax,
	// 	hasDiscount,
	// 	hasShipping,
	// 	hasFee,
	// 	hasTax,
	// 	hasTotals,
	// 	displaySubtotal,
	// 	displayDiscountTotal,
	// 	displayFeeTotal,
	// 	displayShippingTotal,
	// 	taxTotalDisplay,
	// 	taxDisplayCart,
	// 	calcTaxes,
	// 	customerNote,
	// } = useCartTotals(extraTotals$);

	// return (
	// 	<>
	// 		{hasTotals ? (
	// 			<Box
	// 				padding="small"
	// 				space="small"
	// 				border
	// 				style={{
	// 					borderLeftWidth: 0,
	// 					borderRightWidth: 0,
	// 					borderColor: theme.colors.lightGrey,
	// 					backgroundColor: theme.colors.lightestGrey,
	// 				}}
	// 			>
	// 				<Box horizontal>
	// 					<Box fill>
	// 						<Text>{t('Subtotal', { _tags: 'core' })}:</Text>
	// 					</Box>
	// 					<Box>
	// 						<Text>{format(displaySubtotal)}</Text>
	// 					</Box>
	// 				</Box>
	// 				{
	// 					// Discounts
	// 					hasDiscount && (
	// 						<Box horizontal>
	// 							<Box fill>
	// 								<Text>{t('Discount', { _tags: 'core' })}:</Text>
	// 							</Box>
	// 							<Box>
	// 								<Text>{format(`-${displayDiscountTotal}`)}</Text>
	// 							</Box>
	// 						</Box>
	// 					)
	// 				}
	// 				{
	// 					// Fees
	// 					hasFee && (
	// 						<Box horizontal>
	// 							<Box fill>
	// 								<Text>{t('Fees', { _tags: 'core' })}:</Text>
	// 							</Box>
	// 							<Box>
	// 								<Text>{format(displayFeeTotal)}</Text>
	// 							</Box>
	// 						</Box>
	// 					)
	// 				}
	// 				{
	// 					// Shipping
	// 					hasShipping && (
	// 						<Box horizontal>
	// 							<Box fill>
	// 								<Text>{t('Shipping', { _tags: 'core' })}:</Text>
	// 							</Box>
	// 							<Box>
	// 								<Text>{format(displayShippingTotal)}</Text>
	// 							</Box>
	// 						</Box>
	// 					)
	// 				}
	// 				{calcTaxes && hasTax ? (
	// 					taxTotalDisplay === 'itemized' ? (
	// 						<ItemizedTaxes taxLines={tax_lines} taxDisplayCart={taxDisplayCart} />
	// 					) : (
	// 						<Box horizontal>
	// 							<Box fill>
	// 								<Text>{t('Total Tax', { _tags: 'core' })}:</Text>
	// 							</Box>
	// 							<Box horizontal space="normal">
	// 								<Box fill align="end">
	// 									<Text>{taxDisplayCart}.</Text>
	// 								</Box>
	// 								<Box>
	// 									<Text>{format(total_tax || 0)}</Text>
	// 								</Box>
	// 							</Box>
	// 						</Box>
	// 					)
	// 				) : null}
	// 			</Box>
	// 		) : null}
	// 		{!isEmpty(customerNote) && (
	// 			<Box
	// 				padding="small"
	// 				space="small"
	// 				border
	// 				style={{
	// 					borderLeftWidth: 0,
	// 					borderRightWidth: 0,
	// 					borderColor: theme.colors.lightGrey,
	// 					backgroundColor: theme.colors.lightestGrey,
	// 				}}
	// 			>
	// 				<CustomerNote note={customerNote} />
	// 			</Box>
	// 		)}
	// 	</>
	// );
};

export default Totals;
