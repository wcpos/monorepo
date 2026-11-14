import toNumber from 'lodash/toNumber';

import { Chip } from '@wcpos/components/chip';
import {
	getNetPaymentTotal,
	isActiveFeeLine,
	isActiveLineItem,
	isActiveShippingLine,
	refundValue,
} from '@wcpos/order-math';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { MoneyList } from '@wcpos/components/money-list';
import { Text } from '@wcpos/components/text';
import { useRecordField } from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { Taxes } from './totals/taxes';
import { useT } from '../../../../contexts/translations';
import { useCurrentOrderCurrencyFormat } from '../../hooks/use-current-order-currency-format';
import { useNumberFormat } from '../../hooks/use-number-format';
import { useTaxInclOrExcl } from '../../hooks/use-tax-incl-or-excl';
import { useCurrentOrder } from '../contexts/current-order';
import { useCartLines } from '../hooks/use-cart-lines';
import { useOrderTotals } from '../hooks/use-order-totals';
import { quickDiscountLabel, readQuickDiscountIntent } from '../hooks/quick-discount';
import { useRemoveCoupon } from '../hooks/use-remove-coupon';

/**
 * `readOnly` (the stilled cart in checkout and receipt): the coupon chips lose their remove
 * control, so a coupon cannot change under a payment being taken.
 */
export function Totals({ readOnly = false }: { readOnly?: boolean }) {
	const t = useT();
	const { format } = useCurrentOrderCurrencyFormat();
	const { format: formatNumber } = useNumberFormat();
	const { inclOrExcl } = useTaxInclOrExcl({ context: 'cart' });

	const {
		subtotal,
		subtotal_tax,
		fee_total,
		fee_tax,
		tax_lines,
		total_tax,
		shipping_tax,
		shipping_total,
	} = useOrderTotals();
	const { coupon_lines } = useCartLines();
	const { removeCoupon } = useRemoveCoupon();
	const { currentOrderRecord } = useCurrentOrder();
	const refunds = useRecordField(currentOrderRecord, (order) => order.payload.refunds);
	const orderTotal = useRecordField(currentOrderRecord, (order) => order.payload.total);
	const orderDiscountTotal = useRecordField(
		currentOrderRecord,
		(order) => order.payload.discount_total
	);
	// Exempt with every line untaxed. A line still carrying tax (repair pending) keeps the real
	// rows: a forced zero would hide the inconsistency.
	const exempt = useRecordField(
		currentOrderRecord,
		({ payload }) =>
			wooMetaCarrier.vatExempt(payload.meta_data) &&
			[
				...(payload.line_items ?? []).filter(isActiveLineItem),
				...(payload.fee_lines ?? []).filter(isActiveFeeLine),
				...(payload.shipping_lines ?? []).filter(isActiveShippingLine),
			].every(
				(line) =>
					!toNumber(line.total_tax) &&
					!toNumber((line as { subtotal_tax?: string }).subtotal_tax) &&
					(line.taxes ?? []).every(
						(tax) =>
							!toNumber(tax?.total) && !toNumber((tax as { subtotal?: string } | null)?.subtotal)
					)
			)
	);

	/**
	 * Convert to numbers
	 */
	const subtotalNumber = toNumber(subtotal);
	const subtotalTaxNumber = toNumber(subtotal_tax);
	const feeTotalNumber = toNumber(fee_total);
	const shippingTotalNumber = toNumber(shipping_total);
	const totalTaxNumber = toNumber(total_tax);
	const feeTaxNumber = toNumber(fee_tax);
	const shippingTaxNumber = toNumber(shipping_tax);

	/**
	 * Helpers
	 */
	const hasSubtotal = subtotalNumber !== 0;
	const hasShipping = shippingTotalNumber !== 0;
	const hasFee = feeTotalNumber !== 0;
	const hasTax = totalTaxNumber !== 0;

	/**
	 *
	 */
	const displaySubtotal =
		inclOrExcl === 'incl' ? subtotalNumber + subtotalTaxNumber : subtotalNumber;
	const displayFeeTotal = inclOrExcl === 'incl' ? feeTotalNumber + feeTaxNumber : feeTotalNumber;
	const displayShippingTotal =
		inclOrExcl === 'incl' ? shippingTotalNumber + shippingTaxNumber : shippingTotalNumber;

	const hasCoupons = coupon_lines.length > 0;
	const hasRefunds = Boolean(refunds && refunds.length > 0);
	const hasTotals = hasSubtotal || hasCoupons || hasShipping || hasFee || hasTax || hasRefunds;
	const netPayment = getNetPaymentTotal(orderTotal, refunds);

	return (
		<>
			{hasTotals ? (
				<MoneyList className="border-border bg-card border-t [border-style:var(--shape-rule-style)] p-2">
					<MoneyList.Row
						testID="cart-subtotal"
						label={t('common.subtotal')}
						amount={format(displaySubtotal)}
					/>
					{
						// Coupon chips
						coupon_lines.map((coupon) => {
							const code = coupon.code;
							const intent = readQuickDiscountIntent(coupon);
							if (!code) return null;
							const label = intent ? quickDiscountLabel(intent, t, formatNumber) : code;
							const couponDiscount = toNumber(coupon.discount);
							const couponDiscountTax = toNumber(coupon.discount_tax);
							const displayCouponDiscount =
								inclOrExcl === 'incl' ? couponDiscount + couponDiscountTax : couponDiscount;
							return (
								<MoneyList.Row
									key={code}
									label={
										<Chip
											icon="discount"
											label={label}
											onClear={readOnly ? undefined : () => removeCoupon(code)}
											clearTestID={`remove-coupon-${code}`}
											clearLabel={
												intent
													? t('pos_cart.remove_discount_label', { label })
													: `Remove coupon ${code}`
											}
											className="grow-0"
										/>
									}
									amount={format(-1 * displayCouponDiscount)}
								/>
							);
						})
					}
					{hasFee && <MoneyList.Row label={t('pos_cart.fees')} amount={format(displayFeeTotal)} />}
					{hasShipping && (
						<MoneyList.Row label={t('common.shipping')} amount={format(displayShippingTotal)} />
					)}
					{hasTax || exempt ? (
						<ErrorBoundary>
							<Taxes
								exempt={exempt}
								totalTax={total_tax}
								taxLines={tax_lines?.filter((t): t is NonNullable<typeof t> => t !== null)}
							/>
						</ErrorBoundary>
					) : null}
					{hasRefunds && refunds && (
						<>
							{refunds.map((refund) => (
								<MoneyList.Row
									key={refund.id}
									tone="bad"
									label={`${t('orders.refund')} #${refund.id}`}
									amount={format(-refundValue(refund))}
								/>
							))}
							<MoneyList.Total label={t('orders.net_payment')} amount={format(netPayment)} />
						</>
					)}
				</MoneyList>
			) : null}
			{/*
			  The till's own money, raw, for E2E — same idea as the data-table
			  footer's hidden row counts, and for the same reason.

			  Since #1507 the POS no longer PUSHES the order aggregate: WooCommerce
			  authors it, so the push body is not a witness to what this cart
			  computed, and a spec comparing sent-against-ack aggregate would pass on
			  an absent field rather than on agreement. These markers ARE the figures
			  the cashier is looking at, which is the referent ADR 0032 §2 is about:
			  the till's arithmetic must equal the store's. Empty string, never a
			  fabricated '0.00' — an order that has not settled yet has no total, and
			  a spec must be able to tell that from a zero one.
			*/}
			<Text testID="cart-order-total" className="hidden">
				{orderTotal ?? ''}
			</Text>
			<Text testID="cart-discount-total" className="hidden">
				{orderDiscountTotal ?? ''}
			</Text>
		</>
	);
}
