import * as React from 'react';

import { useObservableSuspense, useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { useAppState } from '../../../../contexts/app-state';

type TaxRateDocument = import('@wcpos/database').TaxRateDocument;
type TaxRateCollection = import('@wcpos/database').TaxRateCollection;
type TaxQuery = import('@wcpos/query').Query<TaxRateCollection>;

interface TaxRatesContextProps {
	rates: TaxRateDocument[];
	shippingTaxClass: string;
	calcTaxes: boolean;
	pricesIncludeTax: boolean;
	taxRoundAtSubtotal: boolean;
	// taxBasedOn: 'base' | 'shipping' | 'billing';
	taxQuery: TaxQuery;
}

export const TaxRatesContext = React.createContext<TaxRatesContextProps>(null);

interface TaxRatesProviderProps {
	children: React.ReactNode;
	taxQuery: TaxQuery;
}

/**
 *
 */
export const TaxRatesProvider = ({ children, taxQuery }: TaxRatesProviderProps) => {
	const result = useObservableSuspense(taxQuery.resource);
	const rates = result.hits.map((hit) => hit.document);
	const { store } = useAppState();
	const shippingTaxClass = useObservableEagerState(store.shipping_tax_class$);
	// const taxBasedOn = useObservableState(store.tax_based_on$, store.tax_based_on);

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
	 *
	 */
	return (
		<TaxRatesContext.Provider
			value={{
				rates,
				shippingTaxClass,
				calcTaxes,
				pricesIncludeTax,
				taxRoundAtSubtotal,
				// taxBasedOn,
				taxQuery, // pass through for easy access
			}}
		>
			{children}
		</TaxRatesContext.Provider>
	);
};
