import * as React from 'react';

import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { filterTaxRates } from './tax-rates.helpers';
import { useAppState } from '../../../../contexts/app-state';
import { QueryStateProvider, useCollectionBinding, useQueryState } from '../../../../query';
import { TAX_RATES_ALL_RESULTS_LIMIT, TAX_RATES_INITIAL_SORT } from '../../tax-rates/query-state';
import { useBaseTaxLocation } from '../../hooks/use-base-tax-location';
import {
	type CurrentOrderRecord,
	useCurrentOrderOptional,
} from '../../pos/contexts/current-order/context';

export type TaxRateData = EngineRecord<'taxRates'>['payload'];

interface QueryResult {
	hits: { record: EngineRecord<'taxRates'> }[];
}

/** Address fields used to select the applicable tax rates. */
export interface TaxLocation {
	country: string;
	state: string;
	city: string;
	postcode: string;
}

/** Supported sources for resolving an order's tax location. */
export type TaxBasedOn = 'base' | 'shipping' | 'billing';

/**
 * Store-derived tax settings, plus the unfiltered rate set. Nothing here depends on the
 * current order, so this context does NOT tick when the cart is written to.
 */
export interface TaxSettingsContextProps {
	allRates: TaxRateData[];
	shippingTaxClass: string;
	calcTaxes: boolean;
	pricesIncludeTax: boolean;
	taxRoundAtSubtotal: boolean;
	priceNumDecimals: number;
	taxClasses: string[];
}

/**
 * The order-dependent half: which address tax is based on, that address, and the rates
 * filtered to it. Only consumers that actually need the resolved location subscribe here.
 */
export interface TaxLocationContextProps {
	rates: TaxRateData[];
	taxBasedOn: TaxBasedOn;
	location: TaxLocation;
}

/** Combined tax settings and location contract returned by `useTaxRates()`. */
export type TaxRatesContextProps = TaxSettingsContextProps & TaxLocationContextProps;

/** Order-independent tax settings context. Prefer `useTaxSettings()` when consuming it. */
export const TaxSettingsContext = React.createContext<TaxSettingsContextProps | null>(null);

/** Order-dependent tax location context. Prefer `useTaxLocation()` when consuming it. */
export const TaxLocationContext = React.createContext<TaxLocationContextProps | null>(null);

interface TaxRatesProviderProps {
	children: React.ReactNode;
	/**
	 * Escape hatch for tests and for callers that already hold an order. Production does NOT
	 * pass this — see `TaxLocationProvider`, which subscribes to the current order itself.
	 */
	order?: CurrentOrderRecord;
}

/**
 * Provider for tax rates
 *
 * If an order is passed in, we can use the order's location to query the tax rates.
 *
 * The context is deliberately split in two (#1240). Every cart write produces a new
 * `currentOrder` RxDocument identity, so a single combined context ticked on every
 * add/remove and dragged along consumers that only ever read a store setting — the whole
 * POS products panel re-rendered to read `calcTaxes`. Settings live above the order, the
 * resolved location lives below it, and `useTaxRates()` composes both for the consumers
 * that genuinely need both.
 */
export function TaxRatesProvider({ children, order }: TaxRatesProviderProps) {
	return (
		<QueryStateProvider
			collection="tax-rates"
			initialPageSize={TAX_RATES_ALL_RESULTS_LIMIT}
			initialSort={TAX_RATES_INITIAL_SORT}
		>
			<TaxSettingsProvider>
				<TaxLocationProvider order={order}>{children}</TaxLocationProvider>
			</TaxSettingsProvider>
		</QueryStateProvider>
	);
}

/**
 * Order-independent. Takes no `order` prop on purpose: nothing a cart write does can
 * invalidate this subtree.
 */
function TaxSettingsProvider({ children }: { children: React.ReactNode }) {
	const state = useQueryState<'tax-rates'>();
	const binding = useCollectionBinding('tax-rates', state);
	const result = useObservableSuspense(binding.resource) as QueryResult;
	const allRates = React.useMemo(() => result.hits.map((hit) => hit.record.payload), [result.hits]);

	const { store } = useAppState();
	const shippingTaxClass = useObservableEagerState(store.shipping_tax_class$);

	/**
	 * Convert WooCommerce settings into sensible primatives.
	 *
	 * The piped observables are memoised: `useObservableEagerState` keys its subscription on
	 * the observable identity, so building them inline resubscribed on every render.
	 */
	const calcTaxes$ = React.useMemo(
		() => store.calc_taxes$.pipe(map((val) => val === 'yes')),
		[store]
	);
	const pricesIncludeTax$ = React.useMemo(
		() => store.prices_include_tax$.pipe(map((val) => val === 'yes')),
		[store]
	);
	const taxRoundAtSubtotal$ = React.useMemo(
		() => store.tax_round_at_subtotal$.pipe(map((val) => val === 'yes')),
		[store]
	);

	const calcTaxes = useObservableEagerState(calcTaxes$);
	const pricesIncludeTax = useObservableEagerState(pricesIncludeTax$);
	const taxRoundAtSubtotal = useObservableEagerState(taxRoundAtSubtotal$);
	// Use wc_price_decimals (server-authoritative) for calculations, NOT price_num_decimals
	// (which users can override locally for display formatting).
	const priceNumDecimals = useObservableEagerState(store.wc_price_decimals$) as number;

	const taxClasses = React.useMemo(
		() => [...new Set(allRates.map((r) => r.class).filter(Boolean))] as string[],
		[allRates]
	);

	/**
	 * Memoised explicitly rather than leaning on the React Compiler: this value is the
	 * thing the split exists to keep stable, so it should not depend on a build flag.
	 */
	const value = React.useMemo<TaxSettingsContextProps>(
		() => ({
			allRates, // all rates are needed sometimes for itemized tax display
			shippingTaxClass: shippingTaxClass as string,
			calcTaxes: calcTaxes as boolean,
			pricesIncludeTax: pricesIncludeTax as boolean,
			taxRoundAtSubtotal: taxRoundAtSubtotal as boolean,
			priceNumDecimals: (priceNumDecimals ?? 2) as number,
			taxClasses,
		}),
		[
			allRates,
			shippingTaxClass,
			calcTaxes,
			pricesIncludeTax,
			taxRoundAtSubtotal,
			priceNumDecimals,
			taxClasses,
		]
	);

	return <TaxSettingsContext.Provider value={value}>{children}</TaxSettingsContext.Provider>;
}

function isTaxBasedOn(value: unknown): value is TaxBasedOn {
	return value === 'base' || value === 'shipping' || value === 'billing';
}

function addressValue(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/**
 * Order-dependent. Re-renders when the order identity changes, but the value it publishes
 * is deduped, so consumers only re-render when the tax basis or address actually moved.
 */
function TaxLocationProvider({ children, order: orderProp }: TaxRatesProviderProps) {
	const { allRates } = useTaxSettings();
	const { store } = useAppState();
	const baseLocation = useBaseTaxLocation();

	/**
	 * Subscribe to the current order HERE rather than taking it from an ancestor.
	 *
	 * This is the fix for the reported bug. `POSStack` used to call `useCurrentOrder()` just
	 * to hand the order down as a prop — which put a cart-write subscription ABOVE the
	 * navigator, so every add/remove re-rendered the entire POS stack, products panel and
	 * all. Measured: `POSProductsContent` ×4, `ProductGrid` ×4, `ProductTile` ×80 on every
	 * cart mutation, and no amount of context-splitting or document-identity work below could
	 * stop it, because the panel was being dragged from above rather than through its data.
	 *
	 * Subscribing here keeps the churn where it belongs: this provider re-renders, publishes
	 * a deduped value, and `children` — a stable element prop — is left alone.
	 *
	 * Optional because this provider is also mounted on the standalone Products screen, which
	 * has no current order at all; there it resolves to the shop base address, as before.
	 */
	const currentOrderRecord = useCurrentOrderOptional();
	const order = orderProp ?? currentOrderRecord;
	const meta = useRecordField(order, (record) => record.payload.meta_data);
	const billing = useRecordField(order, (record) => record.payload.billing);
	const shipping = useRecordField(order, (record) => record.payload.shipping);

	/**
	 * Tax Based On
	 * If there is an order and it has a tax based on meta, use that.
	 *
	 * The record-field subscription keeps a payload override reactive without exposing the
	 * legacy flattened document face.
	 */
	const storeTaxBasedOn = useObservableEagerState(store.tax_based_on$);
	const override = wooMetaCarrier.taxBasedOnOverride(meta);
	const taxBasedOn = (isTaxBasedOn(override) ? override : storeTaxBasedOn) as TaxBasedOn;
	const hasOrder = Boolean(order);
	const baseCountry = addressValue(baseLocation.country);
	const baseState = addressValue(baseLocation.state);
	const baseCity = addressValue(baseLocation.city);
	const basePostcode = addressValue(baseLocation.postcode);

	/**
	 * The tax rates causes a render and recalculates the all the tax in the app,
	 * so we want to make sure we only emit rates when they have actually changed
	 */
	const location = React.useMemo<TaxLocation>(() => {
		if (!hasOrder || taxBasedOn === 'base') {
			return {
				country: baseCountry,
				state: baseState,
				city: baseCity,
				postcode: basePostcode,
			};
		}
		const address = taxBasedOn === 'billing' ? billing : shipping;
		return {
			country: addressValue(address?.country),
			state: addressValue(address?.state),
			city: addressValue(address?.city),
			postcode: addressValue(address?.postcode),
		};
	}, [baseCity, baseCountry, basePostcode, baseState, billing, hasOrder, shipping, taxBasedOn]);

	/**
	 * Filter tax rates based on address - store, billing or shipping
	 */
	const rates = React.useMemo(() => {
		const { city, country, state, postcode } = location;
		return filterTaxRates(allRates, country, state, postcode, city);
	}, [allRates, location]);

	const value = React.useMemo<TaxLocationContextProps>(
		() => ({ rates, taxBasedOn, location }),
		[rates, taxBasedOn, location]
	);

	return <TaxLocationContext.Provider value={value}>{children}</TaxLocationContext.Provider>;
}

/**
 * Store-derived tax settings only. Prefer this over `useTaxRates()` — it does not
 * subscribe to the order, so the consumer is immune to cart writes.
 */
export function useTaxSettings(): TaxSettingsContextProps {
	const context = React.useContext(TaxSettingsContext);
	if (!context) {
		throw new Error('useTaxSettings must be called within TaxRatesProvider');
	}
	return context;
}

/**
 * As `useTaxSettings()`, but returns null outside a provider instead of throwing — for the
 * screens (receipt, refund) that render both inside and outside the POS tree and only want
 * a setting if one happens to be available.
 */
export function useTaxSettingsOptional(): TaxSettingsContextProps | null {
	return React.useContext(TaxSettingsContext);
}

/**
 * The resolved tax location and the rates filtered to it.
 */
export function useTaxLocation(): TaxLocationContextProps {
	const context = React.useContext(TaxLocationContext);
	if (!context) {
		throw new Error('useTaxLocation must be called within TaxRatesProvider');
	}
	return context;
}
