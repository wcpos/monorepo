import { Database, appSchema, tableSchema } from '@nozbe/watermelondb';
import hash from 'hash-sum';
import Adapter from './adapter';
import Customer from './models/customer';
import Order from './models/order';
import OrderLineItem from './models/order-line-item';
import Product from './models/product';
import ProductVariation from './models/product-variation';
import Site from './models/site';
import UI from './models/ui';
import UIColumn from './models/ui-column';
import UIDisplay from './models/ui-display';
import User from './models/user';
import customerSchema from './models/customer.schema';
import orderLineItemSchema from './models/order-line-item.schema';
import orderSchema from './models/order.schema';
import productSchema from './models/product.schema';
import productVariationSchema from './models/product-variation.schema';
import uiColumnSchema from './models/ui-column.schema';
import uiDisplaySchema from './models/ui-display.schema';
import uiSchema from './models/ui.schema';

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
			version: 11,
			tables: [
				tableSchema(customerSchema),
				tableSchema(orderLineItemSchema),
				tableSchema(orderSchema),
				tableSchema(productSchema),
				tableSchema(productVariationSchema),
				tableSchema(uiColumnSchema),
				tableSchema(uiDisplaySchema),
				tableSchema(uiSchema),
			],
		}),
	});

	const database = await new Database({
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
			UIDisplay,
			User,
		],
		actionsEnabled: true,
	});

	return database;
};

export default store;
