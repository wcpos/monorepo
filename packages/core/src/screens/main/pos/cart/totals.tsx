import * as React from 'react';

import toNumber from 'lodash/toNumber';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { CustomerNote } from './totals/customer-note';
import { Taxes } from './totals/taxes';
import { useT } from '../../../../contexts/translations';
import { useCurrentOrderCurrencyFormat } from '../../hooks/use-current-order-currency-format';
import { useTaxInclOrExcl } from '../../hooks/use-tax-incl-or-excl';
import { useOrderTotals } from '../hooks/use-order-totals';

/**
 *
 */
export const Totals = () => {
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
				<VStack className="p-2 border-border border-t bg-muted/40">
					<HStack>
						<Text className="grow">{t('Subtotal', { _tags: 'core' })}:</Text>
						<Text>{format(displaySubtotal)}</Text>
					</HStack>
					{
						// Discounts
						hasDiscount && (
							<HStack>
								<Text className="grow">{t('Discount', { _tags: 'core' })}:</Text>
								<Text>{format(-1 * displayDiscountTotal)}</Text>
							</HStack>
						)
					}
					{
						// Fees
						hasFee && (
							<HStack>
								<Text className="grow">{t('Fees', { _tags: 'core' })}:</Text>
								<Text>{format(displayFeeTotal)}</Text>
							</HStack>
						)
					}
					{
						// Shipping
						hasShipping && (
							<HStack>
								<Text className="grow">{t('Shipping', { _tags: 'core' })}:</Text>
								<Text>{format(displayShippingTotal)}</Text>
							</HStack>
						)
					}
					{hasTax ? (
						<ErrorBoundary>
							<Taxes totalTax={total_tax} taxLines={tax_lines} />
						</ErrorBoundary>
					) : null}
				</VStack>
			) : null}
			<CustomerNote />
		</>
	);
};
