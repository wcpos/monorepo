import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { NEVER, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { useQueryManager } from '@wcpos/query';

import { collectMetaKeys, type MetaProduct } from './meta-keys';

type EngineDatabase = {
	collections: {
		products?: {
			find(): { $: Observable<unknown[]> };
		};
	};
};

/**
 * Discover product meta keys from products synced to this device.
 *
 * Local-only: covers products already replicated into RxDB. Subscribes to the
 * products query observable (rather than a one-shot effect) so the suggestion
 * list stays current as products sync in and survives collection resets.
 */
export function useProductMetaKeys(): string[] {
	const manager = useQueryManager();
	const products$ = React.useMemo(
		() =>
			new Observable<EngineDatabase | null>((subscriber) =>
				manager.engine.db$((database) =>
					subscriber.next(database as unknown as EngineDatabase | null)
				)
			).pipe(
				switchMap((database) => {
					if (!database) return NEVER;
					const collection = database.collections.products;
					if (!collection) return of([] as MetaProduct[]);
					return collection.find().$.pipe(
						map((documents) =>
							documents.map((document) => {
								const payload =
									document !== null && typeof document === 'object'
										? (document as { payload?: unknown }).payload
										: undefined;
								const meta_data =
									payload !== null && typeof payload === 'object'
										? (payload as MetaProduct).meta_data
										: undefined;
								return { meta_data };
							})
						)
					);
				})
			),
		[manager]
	);
	const products = useObservableState(products$, []);

	return React.useMemo(() => collectMetaKeys(products), [products]);
}
