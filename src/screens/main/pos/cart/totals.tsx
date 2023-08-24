import * as React from 'react';

import isEmpty from 'lodash/isEmpty';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import CustomerNote from './customer-note';
import ItemizedTaxes from './itemized-taxes';
import { useCartTotals } from './use-cart-totals';
import { t } from '../../../../lib/translations';
import useCurrencyFormat from '../../hooks/use-currency-format';

/**
 *
 */
const Totals = () => {
	const theme = useTheme();
	const { format } = useCurrencyFormat();
	const {
		tax_lines,
		total_tax,
		hasDiscount,
		hasShipping,
		hasFee,
		hasTax,
		hasTotals,
		displaySubtotal,
		displayDiscountTotal,
		displayFeeTotal,
		displayShippingTotal,
		taxTotalDisplay,
		taxDisplayCart,
		calcTaxes,
		customerNote,
	} = useCartTotals();

	return (
		<>
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
					{calcTaxes && hasTax ? (
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
					<CustomerNote note={customerNote} />
				</Box>
			)}
		</>
	);
};

export default Totals;
