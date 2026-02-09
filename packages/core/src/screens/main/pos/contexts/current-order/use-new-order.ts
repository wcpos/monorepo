import { decode } from 'html-entities';
import {
	ObservableResource,
	useObservableEagerState,
	useObservableSuspense,
} from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { from } from 'rxjs';
import { distinctUntilChanged, filter, shareReplay, switchMap, tap } from 'rxjs/operators';
import useDeepCompareEffect from 'use-deep-compare-effect';

import { createTemporaryDB } from '@wcpos/database';

import { useAppState } from '../../../../../contexts/app-state';
import allCurrencies from '../../../../../contexts/currencies/currencies.json';
import { useDefaultCustomer } from '../../../hooks/use-default-customer';
import { transformCustomerJSONToOrderJSON } from '../../hooks/utils';

const temporaryDB$ = from(createTemporaryDB()).pipe(shareReplay(1));

const newOrder$ = temporaryDB$.pipe(
	switchMap((db) => {
		if (!db) throw new Error('Temporary DB not initialized');
		return db.orders.findOne().$.pipe(
			tap((order) => {
				if (!isRxDocument(order)) {
					void db.orders.insert({
						status: 'pos-open',
						created_via: 'woocommerce-pos',
						billing: {},
						shipping: {},
					});
				}
			}),
			filter((order) => isRxDocument(order))
		);
	}),
	distinctUntilChanged((prev, next) => prev?.uuid === next?.uuid)
);

/**
 * @FIXME: This will subscribe and emit a new order on app load, I should be careful about
 * global subscriptions like this.
 */
const newOrderResource = new ObservableResource(newOrder$);

/**
 *
 */
export const useNewOrder = () => {
	const { store, wpCredentials } = useAppState();
	const { defaultCustomerResource } = useDefaultCustomer();

	const defaultCustomer = useObservableSuspense(defaultCustomerResource);
	const currency = useObservableEagerState(store.currency$);
	// const prices_include_tax = useObservableEagerState(store.prices_include_tax$);
	const tax_based_on = useObservableEagerState(store.tax_based_on$);
	const country = useObservableEagerState(store.store_country$);

	const newOrder = useObservableSuspense(newOrderResource);

	/**
	 *
	 */
	useDeepCompareEffect(() => {
		const customer = isRxDocument(defaultCustomer)
			? defaultCustomer.toMutableJSON()
			: defaultCustomer;
		const baseData = transformCustomerJSONToOrderJSON(
			customer as import('@wcpos/database').CustomerDocument,
			country as string
		);
		const data: Record<string, unknown> = { ...baseData };
		data.currency = currency;
		const currencyData = allCurrencies.find((c) => c.code === currency) ?? { symbol: '' };
		data.currency_symbol = decode(currencyData.symbol || '');
		data.prices_include_tax = false; // This setting means nothing, WC REST API always returns prices excluding tax
		data.meta_data = [
			{
				key: '_woocommerce_pos_tax_based_on',
				value: tax_based_on,
			},
			{
				key: '_pos_user',
				value: String(wpCredentials.id),
			},
		];

		if (store.id !== 0) {
			(data.meta_data as { key: string; value: string }[]).push({
				key: '_pos_store',
				value: String(store.id),
			});
		}

		newOrder!.incrementalPatch(data);
	}, [newOrder, defaultCustomer, currency, tax_based_on, country]);

	return { newOrder };
};
