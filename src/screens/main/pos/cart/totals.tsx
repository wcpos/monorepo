import * as React from 'react';

import isEmpty from 'lodash/isEmpty';
import { useObservableEagerState } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import CustomerNote from './customer-note';
import ItemizedTaxes from './itemized-taxes';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useTaxDisplay } from '../../hooks/taxes/use-tax-display';
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
	const { inclOrExcl } = useTaxDisplay({ context: 'cart' });
	const { store } = useAppState();
	const taxTotalDisplay = useObservableEagerState(store.tax_total_display$);
	const calcTaxes = true;

	const {
		subtotal,
		subtotal_tax,
		fee_total,
		fee_tax,
		tax_lines,
		total_tax,
		discount_tax,
		discount_total,
		shipping_tax,
		shipping_total,
	} = useOrderTotals();

	/**
	 * Helpers
	 */
	const hasSubtotal = parseFloat(subtotal) !== 0;
	const hasDiscount = parseFloat(discount_total) !== 0;
	const hasShipping = parseFloat(shipping_total) !== 0;
	const hasFee = parseFloat(fee_total) !== 0;
	const hasTax = parseFloat(total_tax) !== 0;
	const hasTotals = hasSubtotal || hasDiscount || hasShipping || hasFee || hasTax;

	/**
	 *
	 */
	const displaySubtotal =
		inclOrExcl === 'incl' ? parseFloat(subtotal) + parseFloat(subtotal_tax) : subtotal;
	const displayDiscountTotal =
		inclOrExcl === 'incl' ? parseFloat(discount_total) + parseFloat(discount_tax) : discount_total;
	const displayFeeTotal =
		inclOrExcl === 'incl' ? parseFloat(fee_total) + parseFloat(fee_tax) : fee_total;
	const displayShippingTotal =
		inclOrExcl === 'incl' ? parseFloat(shipping_total) + parseFloat(shipping_tax) : shipping_total;

	const customerNote = useObservableEagerState(currentOrder.customer_note$);

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
							<ItemizedTaxes taxLines={tax_lines} taxDisplayCart={inclOrExcl} />
						) : (
							<Box horizontal>
								<Box fill>
									<Text>{t('Total Tax', { _tags: 'core' })}:</Text>
								</Box>
								<Box horizontal space="normal">
									<Box fill align="end">
										<Text>{inclOrExcl}</Text>
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
