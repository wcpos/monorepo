import * as React from 'react';

import { useObservable, useObservableState } from 'observable-hooks';
import { of, combineLatest } from 'rxjs';
import { switchMap, map, distinctUntilChanged } from 'rxjs/operators';

import { useAppState } from '../../../contexts/app-state';
import useBaseTaxLocation from '../hooks/use-base-tax-location';

/**
 *
 */
const useTaxLocation = (currentOrder) => {
	const { store } = useAppState();
	const baseLocation = useBaseTaxLocation();

	/**
	 *
	 */
	const initialTaxLocation = React.useMemo(() => {
		if (store.tax_based_on === 'billing') {
			return {
				country: currentOrder.billing.country,
				state: currentOrder.billing.state,
				city: currentOrder.billing.city,
				postcode: currentOrder.billing.postcode,
			};
		}
		if (store.tax_based_on === 'shipping') {
			return {
				country: currentOrder.shipping.country,
				state: currentOrder.shipping.state,
				city: currentOrder.shipping.city,
				postcode: currentOrder.shipping.postcode,
			};
		}
		return baseLocation;
	}, [store.tax_based_on, currentOrder, baseLocation]);

	/**
	 * We don't want the tax location to change often as it will cause the current order
	 * provider to be re-rendered. If the tax is based on store location (default) then there is
	 * no need to subscribe to customer addresses.
	 */
	const taxLocation$ = useObservable(
		(inputs$) =>
			combineLatest([store.tax_based_on$, inputs$]).pipe(
				switchMap(([taxBasedOn, [order]]) => {
					if (taxBasedOn === 'billing') {
						return combineLatest([
							order.billing.country$,
							order.billing.state$,
							order.billing.city$,
							order.billing.postcode$,
						]).pipe(
							map(([country = '', state = '', city = '', postcode = '']) => ({
								country,
								state,
								city,
								postcode,
							}))
						);
					}
					if (taxBasedOn === 'shipping') {
						return combineLatest([
							order.shipping.country$,
							order.shipping.state$,
							order.shipping.city$,
							order.shipping.postcode$,
						]).pipe(
							map(([country = '', state = '', city = '', postcode = '']) => ({
								country,
								state,
								city,
								postcode,
							}))
						);
					}
					return of(baseLocation);
				}),
				distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr))
			),
		[currentOrder]
	);

	return useObservableState(taxLocation$, initialTaxLocation);
};

export default useTaxLocation;
