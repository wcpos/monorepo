import * as React from 'react';

import { decode } from 'html-entities';
import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '../../../../contexts/app-state';
import allCurrencies from '../../../../contexts/currencies/currencies.json';
import { getNetPaymentTotal } from '../cart/utils/get-net-payment-total';
import { calculateOrderTotals } from '../hooks/calculate-order-totals';
import { useCouponAwareStableTotals } from '../hooks/use-coupon-aware-stable-totals';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCurrentOrder } from '../contexts/current-order';
import { customerDisplayBroadcast } from './broadcast';
import { createCustomerDisplayState } from './create-snapshot';

import type { CustomerDisplayBroadcast } from './broadcast';
import type { CustomerDisplayStatus } from './types';

interface CustomerDisplayBroadcasterProps {
	status: Exclude<CustomerDisplayStatus, 'idle'>;
	broadcast?: CustomerDisplayBroadcast;
}

/** Publishes the selected POS order as a transport-neutral customer-display snapshot. */
export function CustomerDisplayBroadcaster({
	status,
	broadcast = customerDisplayBroadcast,
}: CustomerDisplayBroadcasterProps) {
	const { currentOrder } = useCurrentOrder();

	return (
		<CustomerDisplayOrderBroadcaster
			key={currentOrder.uuid}
			status={status}
			broadcast={broadcast}
			currentOrder={currentOrder}
		/>
	);
}

interface CustomerDisplayOrderBroadcasterProps extends CustomerDisplayBroadcasterProps {
	currentOrder: import('@wcpos/database').OrderDocument;
}

function CustomerDisplayOrderBroadcaster({
	status,
	broadcast = customerDisplayBroadcast,
	currentOrder,
}: CustomerDisplayOrderBroadcasterProps) {
	const [owner] = React.useState(() => Symbol('customer-display-broadcaster'));
	const orderCurrencyCode = useObservableEagerState(currentOrder.currency$!);
	const orderCurrencySymbol = useObservableEagerState(currentOrder.currency_symbol$!);
	const lineItemsValue = useObservableEagerState(currentOrder.line_items$!);
	const feeLinesValue = useObservableEagerState(currentOrder.fee_lines$!);
	const shippingLinesValue = useObservableEagerState(currentOrder.shipping_lines$!);
	const couponLinesValue = useObservableEagerState(currentOrder.coupon_lines$!);
	const orderTotal = useObservableEagerState(currentOrder.total$!);
	const refunds = useObservableEagerState(currentOrder.refunds$!);
	const { allRates, taxRoundAtSubtotal, priceNumDecimals, pricesIncludeTax } = useTaxRates();
	const { store } = useAppState();
	const storeCurrencyCode = useObservableEagerState(store.currency$) as string | undefined;
	const normalizedOrderCurrencyCode = orderCurrencyCode?.trim();
	const currencyCode = normalizedOrderCurrencyCode || storeCurrencyCode?.trim() || '';
	const currencySymbol =
		(normalizedOrderCurrencyCode && orderCurrencySymbol?.trim()
			? decode(orderCurrencySymbol.trim())
			: undefined) ||
		decode(allCurrencies.find((currency) => currency.code === currencyCode)?.symbol ?? '');

	const calculatedTotals = React.useMemo(() => {
		const lineItems = (lineItemsValue ?? []).filter((item) => item.product_id !== null);
		const feeLines = (feeLinesValue ?? []).filter((line) => line.name !== null);
		const shippingLines = (shippingLinesValue ?? []).filter((line) => line.method_id !== null);
		const couponLines = (couponLinesValue ?? []).filter((line) => line.code != null);

		return calculateOrderTotals({
			lineItems,
			feeLines,
			shippingLines,
			couponLines,
			taxRates: allRates,
			taxRoundAtSubtotal,
			dp: priceNumDecimals,
			pricesIncludeTax,
		});
	}, [
		allRates,
		couponLinesValue,
		feeLinesValue,
		lineItemsValue,
		priceNumDecimals,
		pricesIncludeTax,
		shippingLinesValue,
		taxRoundAtSubtotal,
	]);
	const hasCoupons = (couponLinesValue ?? []).some((line) => line.code != null);
	const totals = useCouponAwareStableTotals(calculatedTotals, hasCoupons);
	const checkoutTotal =
		status === 'awaiting-payment' ? getNetPaymentTotal(orderTotal, refunds) : undefined;

	const state = React.useMemo(() => {
		const lineItems = (lineItemsValue ?? []).filter((item) => item.product_id !== null);
		const feeLines = (feeLinesValue ?? []).filter((line) => line.name !== null);
		const shippingLines = (shippingLinesValue ?? []).filter((line) => line.method_id !== null);

		return createCustomerDisplayState({
			status,
			currencyCode,
			currencySymbol,
			decimalPlaces: priceNumDecimals,
			pricesIncludeTax,
			lineItems: lineItems.map((item) => ({
				productId: item.product_id,
				name: item.name,
				quantity: item.quantity,
				price: item.price,
				subtotal: item.subtotal,
				subtotalTax: item.subtotal_tax,
				total: item.total,
				totalTax: item.total_tax,
				image: item.image,
			})),
			feeLines: feeLines.map((line) => ({
				name: line.name,
				total: line.total,
				totalTax: line.total_tax,
			})),
			shippingLines: shippingLines.map((line) => ({
				methodId: line.method_id,
				name: line.method_title,
				total: line.total,
				totalTax: line.total_tax,
			})),
			totals: {
				subtotal: totals.subtotal,
				subtotalTax: totals.subtotal_tax,
				discount: totals.discount_total,
				discountTax: totals.discount_tax,
				fee: totals.fee_total,
				feeTax: totals.fee_tax,
				shipping: totals.shipping_total,
				shippingTax: totals.shipping_tax,
				tax: totals.total_tax,
				total: checkoutTotal ?? totals.total,
			},
		});
	}, [
		checkoutTotal,
		currencyCode,
		currencySymbol,
		feeLinesValue,
		lineItemsValue,
		priceNumDecimals,
		pricesIncludeTax,
		shippingLinesValue,
		status,
		totals,
	]);

	React.useEffect(() => {
		// Publishing crosses the React boundary into the external observable stream.
		broadcast.publish(state, owner);
	}, [broadcast, owner, state]);

	React.useEffect(() => {
		// This route-lifetime cleanup prevents the replay buffer retaining a departed cart.
		return () => {
			broadcast.clear(owner);
		};
	}, [broadcast, owner]);

	return null;
}
