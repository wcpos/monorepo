import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { TaxesContext } from './taxes-provider';
import { matchedTaxRates, getTaxData } from './utils';

// type UseTaxes = (price?: string, options?: {}) => { displayPrice: string; taxes?: any[] };

/**
 *
 */
export const useTaxes = () => {
	const context = React.useContext(TaxesContext);
	if (!context) {
		throw new Error(`useTaxes must be called within TaxesProvider`);
	}

	const { resource, settings } = context;
	const allTaxRates = useObservableSuspense(resource);

	/**
	 *
	 */

	/**
	 *
	 */
	const calcTaxes = React.useCallback(
		(price, tax_class) => {
			const noTaxCalc = { displayPrice: price || '0', taxes: [] };

			// early return if calc_taxes is not enabled
			if (settings.calc_taxes === 'no') return noTaxCalc;

			const taxRates = matchedTaxRates(
				allTaxRates,
				settings.default_country,
				'',
				settings.store_postcode,
				settings.store_city,
				tax_class
			);

			// early return if no tax rates
			if (taxRates.length === 0) return noTaxCalc;

			return getTaxData(price, taxRates, settings.prices_include_tax === 'yes');
		},
		[
			allTaxRates,
			settings.calc_taxes,
			settings.default_country,
			settings.prices_include_tax,
			settings.store_city,
			settings.store_postcode,
		]
	);

	/**
	 *
	 */
	return { allTaxRates, calcTaxes };
};
