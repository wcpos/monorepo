import * as React from 'react';

import { useObservableSuspense, useObservableEagerState, useObservable } from 'observable-hooks';
import { combineLatest, of } from 'rxjs';
import { map, switchMap, distinctUntilChanged } from 'rxjs/operators';

import { filterTaxRates } from './tax-rates.helpers';
import { useAppState } from '../../../../contexts/app-state';
import { useBaseTaxLocation } from '../../hooks/use-base-tax-location';

type TaxRateDocument = import('@wcpos/database').TaxRateDocument;
type TaxRateCollection = import('@wcpos/database').TaxRateCollection;
type TaxQuery = import('@wcpos/query').Query<TaxRateCollection>;

interface TaxRatesContextProps {
	allRates: TaxRateDocument[];
	rates: TaxRateDocument[];
	shippingTaxClass: string;
	calcTaxes: boolean;
	pricesIncludeTax: boolean;
	taxRoundAtSubtotal: boolean;
	taxBasedOn: 'base' | 'shipping' | 'billing';
	location: {
		country: string;
		state: string;
		city: string;
		postcode: string;
	};
	taxQuery: TaxQuery;
	taxClasses: string[];
}

export const TaxRatesContext = React.createContext<TaxRatesContextProps>(null);

interface TaxRatesProviderProps {
	children: React.ReactNode;
	taxQuery: TaxQuery;
	order?: import('@wcpos/database').OrderDocument;
}

/**
 * Provider for tax rates
 *
 * If an order is passed in, we can use the order's location to query the tax rates
 */
export const TaxRatesProvider = ({ children, taxQuery, order }: TaxRatesProviderProps) => {
	const result = useObservableSuspense(taxQuery.resource);
	const allRates = React.useMemo(() => result.hits.map((hit) => hit.document), [result.hits]);

	const { store } = useAppState();
	const shippingTaxClass = useObservableEagerState(store.shipping_tax_class$);
	const baseLocation = useBaseTaxLocation();

	/**
	 * Convert WooCommerce settings into sensible primatives
	 */
	const calcTaxes = useObservableEagerState(store.calc_taxes$.pipe(map((val) => val === 'yes')));
	const pricesIncludeTax = useObservableEagerState(
		store.prices_include_tax$.pipe(map((val) => val === 'yes'))
	);
	const taxRoundAtSubtotal = useObservableEagerState(
		store.tax_round_at_subtotal$.pipe(map((val) => val === 'yes'))
	);

	/**
	 * Tax Based On
	 * If there is an order and it has a tax based on meta, use that
	 */
	let taxBasedOn = useObservableEagerState(store.tax_based_on$);
	if (order) {
		const meta = (order.meta_data ?? []).find((m) => m.key === '_woocommerce_pos_tax_based_on');
		if (meta && (meta.value === 'base' || meta.value === 'shipping' || meta.value === 'billing')) {
			taxBasedOn = meta.value;
		}
	}

	/**
	 * The tax rates causes a render and recalculates the all the tax in the app,
	 * so we want to make sure we only emit rates when they have actually changed
	 */
	const location$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([order, taxBasedOn, baseLocation]) => {
					// if no order, use the base location
					if (!order || taxBasedOn === 'base') {
						return of(baseLocation);
					}
					// subscribe to the order billing and shipping addresses
					return combineLatest([order.billing$, order.shipping$]).pipe(
						map(([billing, shipping]) => {
							if (taxBasedOn === 'billing') {
								return {
									country: billing.country,
									state: billing.state,
									city: billing.city,
									postcode: billing.postcode,
								};
							}
							if (taxBasedOn === 'shipping') {
								return {
									country: shipping.country,
									state: shipping.state,
									city: shipping.city,
									postcode: shipping.postcode,
								};
							}
							return baseLocation;
						})
					);
				}),
				distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next))
			),
		[order, taxBasedOn, baseLocation]
	);

	const location = useObservableEagerState(location$);

	/**
	 * Filter tax rates based on address - store, billing or shipping
	 */
	const rates = React.useMemo(() => {
		const { city, country, state, postcode } = location;
		return filterTaxRates(allRates, country, state, postcode, city);
	}, [allRates, location]);

	/**
	 *
	 */
	return (
		<TaxRatesContext.Provider
			value={{
				allRates, // all rates are needed sometimes for itemized tax display
				rates,
				shippingTaxClass,
				calcTaxes,
				pricesIncludeTax,
				taxRoundAtSubtotal,
				taxBasedOn,
				location,
				taxQuery, // pass through for easy access
			}}
		>
			{children}
		</TaxRatesContext.Provider>
	);
};
