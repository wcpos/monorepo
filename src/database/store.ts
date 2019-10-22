import { Database, appSchema, tableSchema } from '@nozbe/watermelondb';
import hash from 'hash-sum';
import Adapter from './adapter';
import Customer from './models/customer';
import Order from './models/order';
import OrderLineItem from './models/order-line-item';
import Product from './models/product';
import ProductVariation from './models/product-variation';
import customerSchema from './models/customer.schema';
import orderLineItemSchema from './models/order-line-item.schema';
import orderSchema from './models/order.schema';
import productSchema from './models/product.schema';
import productVariationSchema from './models/product-variation.schema';

type Props = {
	site?: string;
	user?: string;
	store?: string;
};

const store = async (obj: Props) => {
	if (!obj.site || !obj.user) {
		return;
	}

	const dbName = hash(obj);

	const adapter = new Adapter({
		dbName,
		schema: appSchema({
			version: 12,
			tables: [
				tableSchema(customerSchema),
				tableSchema(orderLineItemSchema),
				tableSchema(orderSchema),
				tableSchema(productSchema),
				tableSchema(productVariationSchema),
			],
		}),
	});

	const database = await new Database({
		adapter,
		modelClasses: [Customer, Order, OrderLineItem, Product, ProductVariation],
		actionsEnabled: true,
	});

	return database;
};

export default store;
