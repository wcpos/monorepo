import * as React from 'react';

import { decode } from 'html-entities';
import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '../../../../contexts/app-state';
import allCurrencies from '../../../../contexts/currencies/currencies.json';
import { getNetPaymentTotal } from '../cart/utils/get-net-payment-total';
import { calculateOrderTotals } from '../hooks/calculate-order-totals';
import { useCouponAwareStableValue } from '../hooks/use-coupon-aware-stable-totals';
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

	const calculatedProjection = React.useMemo(() => {
		const lineItems = (lineItemsValue ?? []).filter((item) => item.product_id !== null);
		const feeLines = (feeLinesValue ?? []).filter((line) => line.name !== null);
		const shippingLines = (shippingLinesValue ?? []).filter((line) => line.method_id !== null);
		const couponLines = (couponLinesValue ?? []).filter((line) => line.code != null);

		return {
			lineItems,
			feeLines,
			shippingLines,
			totals: calculateOrderTotals({
				lineItems,
				feeLines,
				shippingLines,
				couponLines,
				taxRates: allRates,
				taxRoundAtSubtotal,
				dp: priceNumDecimals,
				pricesIncludeTax,
			}),
		};
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
	const projection = useCouponAwareStableValue(calculatedProjection, hasCoupons);
	const checkoutTotal =
		status === 'awaiting-payment' ? getNetPaymentTotal(orderTotal, refunds) : undefined;

	const state = React.useMemo(() => {
		return createCustomerDisplayState({
			status,
			currencyCode,
			currencySymbol,
			decimalPlaces: priceNumDecimals,
			pricesIncludeTax,
			lineItems: projection.lineItems.map((item) => ({
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
			feeLines: projection.feeLines.map((line) => ({
				name: line.name,
				total: line.total,
				totalTax: line.total_tax,
			})),
			shippingLines: projection.shippingLines.map((line) => ({
				methodId: line.method_id,
				name: line.method_title,
				total: line.total,
				totalTax: line.total_tax,
			})),
			totals: {
				subtotal: projection.totals.subtotal,
				subtotalTax: projection.totals.subtotal_tax,
				discount: projection.totals.discount_total,
				discountTax: projection.totals.discount_tax,
				fee: projection.totals.fee_total,
				feeTax: projection.totals.fee_tax,
				shipping: projection.totals.shipping_total,
				shippingTax: projection.totals.shipping_tax,
				tax: projection.totals.total_tax,
				total: checkoutTotal ?? projection.totals.total,
			},
		});
	}, [
		checkoutTotal,
		currencyCode,
		currencySymbol,
		priceNumDecimals,
		pricesIncludeTax,
		projection,
		status,
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
