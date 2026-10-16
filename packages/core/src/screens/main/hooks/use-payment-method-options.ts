import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { useQueryRuntime } from '@wcpos/query';
import { POS_META_KEYS } from '@wcpos/sync-core';

import { mergePaymentMethodOptions, type ObservedPaymentMethod } from './payment-method-options';
import { usePaymentMethods } from './use-payment-methods';

export type { PaymentMethodOption } from './payment-method-options';
type OrderDocument = {
	payload?: {
		payment_method?: string;
		payment_method_title?: string;
		meta_data?: unknown;
	};
};
type EngineDatabase = { collections: { orders?: { find(): { $: Observable<OrderDocument[]> } } } };

/** Resident history stays live across order updates and collection resets. */
export function usePaymentMethodOptions() {
	const runtime = useQueryRuntime();
	const { methods } = usePaymentMethods();
	const orders$ = React.useMemo(
		() =>
			new Observable<EngineDatabase | null>((subscriber) =>
				runtime.engine.db$((database) =>
					subscriber.next(database as unknown as EngineDatabase | null)
				)
			).pipe(
				switchMap((database) => {
					// A disposed engine (site or store switch) emits null: forget the previous
					// database's history rather than keep offering its methods.
					if (!database) return of([] as ObservedPaymentMethod[]);
					const collection = database.collections.orders;
					if (!collection) return of([] as ObservedPaymentMethod[]);
					return collection.find().$.pipe(
						map((documents) =>
							documents.map(({ payload }) => ({
								payment_method: payload?.payment_method,
								payment_method_title: payload?.payment_method_title,
								// A resident order's meta_data is wire data: guard every level so one odd
								// row cannot kill the stream (and with it the filter bar).
								indexMethods: (Array.isArray(payload?.meta_data) ? payload.meta_data : [])
									.filter(
										(entry) => entry?.key === POS_META_KEYS.paymentMethod && entry.value != null
									)
									.map((entry) => String(entry.value)),
							}))
						)
					);
				})
			),
		[runtime]
	);
	const observed = useObservableState(orders$, []);
	return React.useMemo(() => mergePaymentMethodOptions(methods, observed), [methods, observed]);
}
