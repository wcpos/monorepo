// import * as React from 'react';
import { BehaviorSubject } from 'rxjs';
// import useStore from '@wcpos/hooks/src/use-store';

// type CustomerDocument = import('@wcpos/database').CustomerDocument;
type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 * RxDB removed Temporary Documents in v13
 * see: https://github.com/pubkey/rxdb/pull/3777#issuecomment-1120669088
 *
 * The suggestion is to use an empty JSON and update the data there
 * but I need some extra functionality so I'm using a custom class
 */
export default class NewOrder {
	public collection;
	public customer_id: number;
	public customer_id$: BehaviorSubject<number>;
	public billing: any;
	public billing$: BehaviorSubject<any>;
	public shipping: any;
	public shipping$: BehaviorSubject<any>;
	public line_items = [];
	public fee_lines = [];
	public shipping_lines = [];
	public setCurrentOrder: (order: OrderDocument) => void;

	constructor({ collection, setCurrentOrder }) {
		this.collection = collection;
		this.setCurrentOrder = setCurrentOrder;

		this.customer_id = 0;
		this.customer_id$ = new BehaviorSubject(0);
		this.billing = {};
		this.billing$ = new BehaviorSubject({});
		this.shipping = {};
		this.shipping$ = new BehaviorSubject({});
	}

	isCartEmpty() {
		return true;
	}

	toJSON() {
		return {
			status: 'pos-open',
			customer_id: this.customer_id,
			billing: this.billing,
			shipping: this.shipping,
			line_items: this.line_items,
			fee_lines: this.fee_lines,
			shipping_lines: this.shipping_lines,
			date_created_gmt: new Date(Date.now()).toISOString().split('.')[0],
		};
	}

	async save() {
		const orderDoc = await this.collection.insert(this.toJSON());
		this.setCurrentOrder(orderDoc);
	}

	async addFeeLine(data) {
		const newFee = await this.collection.database.collections.fee_lines
			.insert(data)
			.catch((err: any) => {
				debugger;
			});

		this.fee_lines.push(newFee._id);
		await this.save();
	}

	async addShippingLine(data) {
		const newShipping = await this.collection.database.collections.shipping_lines
			.insert(data)
			.catch((err: any) => {
				debugger;
			});

		this.shipping_lines.push(newShipping._id);
		await this.save();
	}

	async addOrUpdateProduct(product) {
		const newLineItem = await this.collection.database.collections.line_items
			.insert({
				product_id: product.id,
				name: product.name,
				quantity: 1,
				price: parseFloat(product.price || ''),
				sku: product.sku,
				tax_class: product.tax_class,
				meta_data: product.meta_data,
			})
			.catch((err: any) => {
				debugger;
			});

		this.line_items.push(newLineItem._id);
		await this.save();
	}
}

/**
 *
 */
// const useNewOrder = ({ setCurrentOrder }) => {
// 	const { storeDB } = useStore();
// 	const orderCollection = storeDB.collections.orders;

// 	// get default customer from the store settings

// 	// I will need the customer provider here to get the default customer

// 	// create a new order
// 	const newOrder = React.useMemo(
// 		() => new NewOrder({ collection: orderCollection, setCurrentOrder }),
// 		[orderCollection, setCurrentOrder]
// 	);

// 	return newOrder;
// };

// export default useNewOrder;
