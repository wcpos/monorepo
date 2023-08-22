import * as React from 'react';

import find from 'lodash/find';
import uniq from 'lodash/uniq';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import {
	calculateTaxes,
	sumTaxes,
	calculateDisplayValues,
	calculateLineItemTotals,
	calculateOrderTotalsAndTaxes,
} from './utils';
import { useAppState } from '../../../../contexts/app-state';

type TaxRateDocument = import('@wcpos/database').TaxRateDocument;
type TaxQuery = import('../../../../contexts/store-state-manager').Query<TaxRateDocument>;

interface TaxHelpersContextProps {
	rates: TaxRateDocument[];
	shippingTaxClass: string;
	calcTaxes: boolean;
	pricesIncludeTax: boolean;
	taxRoundAtSubtotal: boolean;
	calculateTaxesFromPrice: (args: {
		price?: number;
		taxClass?: string;
		taxStatus?: string;
		_pricesIncludeTax?: boolean;
	}) => {
		total: number;
		taxes: any[];
	};
	getDisplayValues: (
		price: string,
		taxClass: string,
		taxDisplayShop: 'incl' | 'excl'
	) => {
		displayPrice: string;
		taxTotal: string;
		taxDisplayShop: 'incl' | 'excl';
	};
	taxBasedOn: 'base' | 'shipping' | 'billing';
	taxQuery: TaxQuery;
	calculateLineItemTaxes: (args: {
		total: string;
		subtotal?: string;
		taxClass?: string;
		taxStatus?: string;
	}) => {
		total_tax: string;
		taxes: {
			id: number;
			subtotal: string;
			total: string;
		}[];
		subtotal_tax?: string;
	};
	calculateShippingLineTaxes: (args: { total: string }) => {
		total: string;
		total_tax: string;
		taxes: {
			id: number;
			subtotal: string;
			total: string;
		}[];
	};
	calculateOrderTotals: (args: { lineItems: any[]; feeLines: any[]; shippingLines: any[] }) => {
		discount_total: string;
		discount_tax: string;
		shipping_total: string;
		shipping_tax: string;
		cart_tax: string;
		total_tax: string;
		total: string;
		tax_lines: {
			id: number;
			rate_code: string;
			rate_id: number;
			label: string;
			compound: boolean;
			tax_total: string;
		}[];
	};
}

export const TaxHelpersContext = React.createContext<TaxHelpersContextProps>(null);

interface TaxHelpersProviderProps {
	children: React.ReactNode;
	taxQuery: TaxQuery;
}

/**
 *
 */
export const TaxHelpersProvider = ({ children, taxQuery }: TaxHelpersProviderProps) => {
	const rates = useObservableSuspense(taxQuery.resource);
	const { store } = useAppState();
	const shippingTaxClass = useObservableState(store.shipping_tax_class$, store.shipping_tax_class);
	const taxBasedOn = useObservableState(store.tax_based_on$, store.tax_based_on);

	/**
	 * Convert WooCommerce settings into sensible primatives
	 */
	const calcTaxes = useObservableState(
		store.calc_taxes$.pipe(map((val) => val === 'yes')),
		store.calc_taxes === 'yes'
	);
	const pricesIncludeTax = useObservableState(
		store.prices_include_tax$.pipe(map((val) => val === 'yes')),
		store.prices_include_tax === 'yes'
	);
	const taxRoundAtSubtotal = useObservableState(
		store.tax_round_at_subtotal$.pipe(map((val) => val === 'yes')),
		store.tax_round_at_subtotal === 'yes'
	);

	/**
	 *
	 */
	const calculateTaxesFromPrice = React.useCallback(
		({ price = 0, taxClass = '', taxStatus = 'taxable', _pricesIncludeTax = pricesIncludeTax }) => {
			const _taxClass = taxClass === '' ? 'standard' : taxClass; // default to standard
			const appliedRates = rates.filter((rate) => rate.class === _taxClass);

			// early return if no taxes
			if (!calcTaxes || taxStatus === 'none' || appliedRates.length === 0) {
				return {
					total: 0,
					taxes: [],
				};
			}

			const taxes = calculateTaxes(price, appliedRates, _pricesIncludeTax);
			return {
				total: sumTaxes(taxes),
				taxes,
			};
		},
		[pricesIncludeTax, calcTaxes, rates]
	);

	/**
	 * Get the display values for a price with or without taxes
	 */
	const getDisplayValues = React.useCallback(
		(price: string = '0', taxClass: string, taxDisplayShop: 'incl' | 'excl') => {
			const _taxClass = taxClass === '' ? 'standard' : taxClass; // default to standard
			const appliedRates = rates.filter((rate) => rate.class === _taxClass);

			// early return if no taxes
			if (!calcTaxes || appliedRates.length === 0) {
				return {
					displayPrice: String(price),
					taxTotal: '0',
					taxDisplayShop,
				};
			}

			return calculateDisplayValues({
				price,
				taxDisplayShop,
				pricesIncludeTax,
				rates: appliedRates,
				taxRoundAtSubtotal,
			});
		},
		[calcTaxes, pricesIncludeTax, rates, taxRoundAtSubtotal]
	);

	/**
	 * Cart specific helper
	 */
	const calculateLineItemTaxes = React.useCallback(
		({
			total,
			subtotal,
			taxClass,
			taxStatus,
		}: {
			total: string;
			subtotal?: string;
			taxClass?: string;
			taxStatus?: string;
		}) => {
			const noSubtotal = subtotal === undefined;
			let subtotalTaxes = { total: 0, taxes: [] };

			if (!noSubtotal) {
				subtotalTaxes = calculateTaxesFromPrice({
					price: parseFloat(subtotal),
					taxClass,
					taxStatus,
					pricesIncludeTax: false,
				});
			}

			const totalTaxes = calculateTaxesFromPrice({
				price: parseFloat(total),
				taxClass,
				taxStatus,
				pricesIncludeTax: false,
			});

			const uniqueTaxIds = uniq([
				...subtotalTaxes.taxes.map((tax) => tax.id),
				...totalTaxes.taxes.map((tax) => tax.id),
			]);

			const taxes = uniqueTaxIds.map((id) => {
				const subtotalTax = find(subtotalTaxes.taxes, { id }) || { total: 0 };
				const totalTax = find(totalTaxes.taxes, { id }) || { total: 0 };
				return {
					id,
					subtotal: noSubtotal ? '' : String(subtotalTax.total),
					total: String(totalTax.total),
				};
			});

			const result = {
				total_tax: String(totalTaxes.total),
				taxes,
			};

			if (!noSubtotal) {
				result.subtotal_tax = String(subtotalTaxes.total);
			}

			return result;
		},
		[calculateTaxesFromPrice]
	);

	/**
	 * TODO - I need to test this against WC unit tests to make sure it's correct
	 * see the WC_Tax::get_shipping_tax_rates() method for more details
	 *
	 * Here we are using any tax rate that has the shipping flag set to true
	 * unless the shipping tax class is set, in which case we use that.
	 * If no tax rates are found, we use the standard tax class.
	 */
	const calculateShippingLineTaxes = React.useCallback(
		({ total }) => {
			let appliedRates = rates.filter((rate) => rate.shipping === true);
			if (shippingTaxClass) {
				appliedRates = rates.filter((rate) => rate.class === shippingTaxClass);
			}

			if (appliedRates.length === 0) {
				appliedRates = rates.filter((rate) => rate.class === 'standard');
			}

			// early return if no taxes
			if (!calcTaxes || appliedRates.length === 0) {
				return {
					total,
					total_tax: '0',
					taxes: [],
				};
			}

			const shippingLineTotals = calculateLineItemTotals({
				quantity: 1,
				price: total,
				total,
				rates: appliedRates,
				pricesIncludeTax: false, // shipping is always exclusive
				taxRoundAtSubtotal,
			});

			// shipping (like fee) has subtotal set to '' in the WC REST API
			const updatedTaxes = shippingLineTotals.taxes.map((tax) => ({
				...tax,
				subtotal: '',
			}));

			return {
				total: shippingLineTotals.total,
				total_tax: shippingLineTotals.total_tax,
				taxes: updatedTaxes,
			};
		},
		[calcTaxes, rates, shippingTaxClass, taxRoundAtSubtotal]
	);

	/**
	 *
	 */
	const calculateOrderTotals = React.useCallback(
		({ lineItems, feeLines, shippingLines }) => {
			return calculateOrderTotalsAndTaxes({
				lineItems,
				feeLines,
				shippingLines,
				taxRates: rates, // NOTE: rates are only used to extract label and compound, not for calculation
				taxRoundAtSubtotal,
			});
		},
		[taxRoundAtSubtotal, rates]
	);

	/**
	 *
	 */
	return (
		<TaxHelpersContext.Provider
			value={{
				rates,
				shippingTaxClass,
				calcTaxes,
				pricesIncludeTax,
				taxRoundAtSubtotal,
				calculateTaxesFromPrice,
				getDisplayValues,
				taxBasedOn,
				taxQuery, // pass through for easy access
				calculateLineItemTaxes,
				calculateShippingLineTaxes,
				calculateOrderTotals,
			}}
		>
			{children}
		</TaxHelpersContext.Provider>
	);
};
