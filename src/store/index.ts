import { Database, appSchema, tableSchema } from '@nozbe/watermelondb';
import Adapter from './adapter';
import Customer from './models/customer';
import Order from './models/order';
import OrderLineItem from './models/order-line-item';
import Product from './models/product';
import ProductVariation from './models/product-variation';
import Site from './models/site';
import UI from './models/ui';
import UIColumn from './models/ui-column';
import User from './models/user';
import customerSchema from './models/customer.schema';
import orderLineItemSchema from './models/order-line-item.schema';
import orderSchema from './models/order.schema';
import productSchema from './models/product.schema';
import productVariationSchema from './models/product-variation.schema';
import siteSchema from './models/site.schema';
import uiColumnSchema from './models/ui-column.schema';
import uiSchema from './models/ui.schema';
import userSchema from './models/user.schema';

const adapter = new Adapter({
	dbName: 'wcpos',
	schema: appSchema({
		version: 26,
		tables: [
			tableSchema(customerSchema),
			tableSchema(orderLineItemSchema),
			tableSchema(orderSchema),
			tableSchema(productSchema),
			tableSchema(productVariationSchema),
			tableSchema(siteSchema),
			tableSchema(uiColumnSchema),
			tableSchema(uiSchema),
			tableSchema(userSchema),
		],
	}),
});

const database = new Database({
	adapter,
	modelClasses: [
		Customer,
		Order,
		OrderLineItem,
		Product,
		ProductVariation,
		Site,
		UI,
		UIColumn,
		User,
	],
	actionsEnabled: false,
});

export default database;
