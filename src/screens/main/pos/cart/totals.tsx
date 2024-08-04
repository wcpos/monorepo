import * as React from 'react';

import { useTheme } from 'styled-components/native';

import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { CustomerNote } from './totals/customer-note';
import { Taxes } from './totals/taxes';
import { useT } from '../../../../contexts/translations';
import { useTaxDisplay } from '../../hooks/taxes/use-tax-display';
import { useCurrentOrderCurrencyFormat } from '../../hooks/use-current-order-currency-format';
import { useOrderTotals } from '../hooks/use-order-totals';

/**
 *
 */
const Totals = () => {
	const theme = useTheme();
	const t = useT();
	const { format } = useCurrentOrderCurrencyFormat();
	const { inclOrExcl } = useTaxDisplay({ context: 'cart' });

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

	return (
		<>
			{hasTotals ? (
				<VStack className="p-2 border-t">
					<HStack>
						<Text className="grow">{t('Subtotal', { _tags: 'core' })}:</Text>
						<Text>{format(displaySubtotal)}</Text>
					</HStack>
					{
						// Discounts
						hasDiscount && (
							<HStack>
								<Text className="grow">{t('Discount', { _tags: 'core' })}:</Text>
								<Text>{format(`-${displayDiscountTotal}`)}</Text>
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

export default Totals;
