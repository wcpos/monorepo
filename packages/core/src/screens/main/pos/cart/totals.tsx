import * as React from 'react';

import toNumber from 'lodash/toNumber';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { CustomerNote } from './totals/customer-note';
import { Taxes } from './totals/taxes';
import { useT } from '../../../../contexts/translations';
import { useCurrentOrderCurrencyFormat } from '../../hooks/use-current-order-currency-format';
import { useTaxInclOrExcl } from '../../hooks/use-tax-incl-or-excl';
import { useOrderTotals } from '../hooks/use-order-totals';

/**
 *
 */
export function Totals() {
	const t = useT();
	const { format } = useCurrentOrderCurrencyFormat();
	const { inclOrExcl } = useTaxInclOrExcl({ context: 'cart' });

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
	 * Convert to numbers
	 */
	const subtotalNumber = toNumber(subtotal);
	const subtotalTaxNumber = toNumber(subtotal_tax);
	const discountTotalNumber = toNumber(discount_total);
	const discountTaxNumber = toNumber(discount_tax);
	const feeTotalNumber = toNumber(fee_total);
	const shippingTotalNumber = toNumber(shipping_total);
	const totalTaxNumber = toNumber(total_tax);
	const feeTaxNumber = toNumber(fee_tax);
	const shippingTaxNumber = toNumber(shipping_tax);

	/**
	 * Helpers
	 */
	const hasSubtotal = subtotalNumber !== 0;
	const hasDiscount = discountTotalNumber !== 0;
	const hasShipping = shippingTotalNumber !== 0;
	const hasFee = feeTotalNumber !== 0;
	const hasTax = totalTaxNumber !== 0;
	const hasTotals = hasSubtotal || hasDiscount || hasShipping || hasFee || hasTax;

	/**
	 *
	 */
	const displaySubtotal =
		inclOrExcl === 'incl' ? subtotalNumber + subtotalTaxNumber : subtotalNumber;
	const displayDiscountTotal =
		inclOrExcl === 'incl' ? discountTotalNumber + discountTaxNumber : discountTotalNumber;
	const displayFeeTotal = inclOrExcl === 'incl' ? feeTotalNumber + feeTaxNumber : feeTotalNumber;
	const displayShippingTotal =
		inclOrExcl === 'incl' ? shippingTotalNumber + shippingTaxNumber : shippingTotalNumber;

	return (
		<>
			{hasTotals ? (
				<VStack className="border-border bg-muted/40 border-t p-2">
					<HStack testID="cart-subtotal">
						<Text className="grow">{t('common.subtotal')}:</Text>
						<Text>{format(displaySubtotal)}</Text>
					</HStack>
					{
						// Discounts
						hasDiscount && (
							<HStack>
								<Text className="grow">{t('pos_cart.discount')}:</Text>
								<Text>{format(-1 * displayDiscountTotal)}</Text>
							</HStack>
						)
					}
					{
						// Fees
						hasFee && (
							<HStack>
								<Text className="grow">{t('pos_cart.fees')}:</Text>
								<Text>{format(displayFeeTotal)}</Text>
							</HStack>
						)
					}
					{
						// Shipping
						hasShipping && (
							<HStack>
								<Text className="grow">{t('common.shipping')}:</Text>
								<Text>{format(displayShippingTotal)}</Text>
							</HStack>
						)
					}
					{hasTax ? (
						<ErrorBoundary>
							<Taxes
								totalTax={total_tax}
								taxLines={tax_lines?.filter((t): t is NonNullable<typeof t> => t !== null)}
							/>
						</ErrorBoundary>
					) : null}
				</VStack>
			) : null}
			<CustomerNote />
		</>
	);
}
