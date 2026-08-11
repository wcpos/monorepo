import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '../../../../contexts/app-state';
import { calculateOrderTotals } from '../hooks/calculate-order-totals';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCurrentOrder } from '../contexts/current-order';
import { customerDisplayBroadcast } from './broadcast';
import { createCustomerDisplayState } from './create-snapshot';

import type { CustomerDisplayBroadcast } from './broadcast';
import type { CustomerDisplayStatus } from './types';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CustomerDisplayBroadcasterProps {
	status: Exclude<CustomerDisplayStatus, 'idle'>;
	broadcast?: CustomerDisplayBroadcast;
}

export function CustomerDisplayBroadcaster({
	status,
	broadcast = customerDisplayBroadcast,
}: CustomerDisplayBroadcasterProps) {
	const [owner] = React.useState(() => Symbol('customer-display-broadcaster'));
	const { currentOrder } = useCurrentOrder();
	const observedOrder = useObservableEagerState(currentOrder.$!);
	const order = (observedOrder ?? currentOrder) as OrderDocument;
	const { allRates, taxRoundAtSubtotal, priceNumDecimals, pricesIncludeTax } = useTaxRates();
	const { store } = useAppState();
	const currencyCode = useObservableEagerState(store.currency$);

	const state = React.useMemo(() => {
		const lineItems = (order.line_items ?? []).filter((item) => item.product_id !== null);
		const feeLines = (order.fee_lines ?? []).filter((line) => line.name !== null);
		const shippingLines = (order.shipping_lines ?? []).filter((line) => line.method_id !== null);
		const couponLines = (order.coupon_lines ?? []).filter((line) => line.code != null);
		const totals = calculateOrderTotals({
			lineItems,
			feeLines,
			shippingLines,
			couponLines,
			taxRates: allRates,
			taxRoundAtSubtotal,
			dp: priceNumDecimals,
			pricesIncludeTax,
		});

		return createCustomerDisplayState({
			status,
			currencyCode: order.currency ?? currencyCode,
			currencySymbol: order.currency_symbol,
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
				total: totals.total,
			},
		});
	}, [
		allRates,
		currencyCode,
		order,
		priceNumDecimals,
		pricesIncludeTax,
		status,
		taxRoundAtSubtotal,
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
