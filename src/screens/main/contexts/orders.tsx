import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, filter, first, expand } from 'rxjs/operators';

import { createTemporaryDB } from '@wcpos/database';

import createDataProvider from './create-data-provider';
type OrderDocument = import('@wcpos/database/src').OrderDocument;

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	search?: string;
	after?: string;
	before?: string;
	modified_after?: string;
	modified_before?: string;
	dates_are_gmt?: boolean;
	exclude?: number[];
	include?: number[];
	offset?: number;
	order?: 'asc' | 'desc';
	orderby?: 'date' | 'id' | 'include' | 'title' | 'slug';
	parent?: number[];
	parent_exclude?: number[];
	status?:
		| 'any'
		| 'pending'
		| 'processing'
		| 'on-hold'
		| 'completed'
		| 'cancelled'
		| 'refunded'
		| 'failed'
		| 'trash';
	customer?: number;
	product?: number;
	dp?: number;
}

/**
 *
 */
const [OrdersProvider, useOrders] = createDataProvider<OrderDocument, APIQueryParams>({
	collectionName: 'orders',
	initialQuery: { sortBy: 'id', sortDirection: 'asc' }, // Default query, will be overridden by prop
	prepareQueryParams: (params, query, checkpoint, batchSize) => {
		let orderby = params.orderby;

		if (query.sortBy === 'date_created' || query.sortBy === 'date_created_gmt') {
			orderby = 'date';
		}

		if (query.sortBy === 'number') {
			orderby = 'id';
		}

		return {
			...params,
			orderby,
		};
	},
});

/**
 * New Order resource
 */
async function getOrCreateNewOrder() {
	const db = await createTemporaryDB();
	let order = await db.orders.findOne().exec();
	if (!order) {
		order = await db.orders.insert({ status: 'pos-open' });
	}
	return order;
}

// get the new order
const resource$ = from(getOrCreateNewOrder()).pipe(
	expand((order) =>
		order.deleted$.pipe(
			filter((deleted) => deleted),
			switchMap(() => from(getOrCreateNewOrder())),
			first()
		)
	)
);

const newOrderResource = new ObservableResource(resource$);

export { OrdersProvider, useOrders, newOrderResource };
