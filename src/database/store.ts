import { Database, appSchema, tableSchema } from '@nozbe/watermelondb';
import hash from 'hash-sum';
import Adapter from './adapter';
import Category from './models/category';
import Customer from './models/customer';
import Image from './models/image';
import Order from './models/order';
import OrderLineItem from './models/order-line-item';
import Product from './models/product';
import ProductCategory from './models/product-category';
import ProductTag from './models/product-tag';
import ProductVariation from './models/product-variation';
import Tag from './models/tag';
import categorySchema from './models/category.schema';
import customerSchema from './models/customer.schema';
import imageSchema from './models/image.schema';
import orderLineItemSchema from './models/order-line-item.schema';
import orderSchema from './models/order.schema';
import productSchema from './models/product.schema';
import productCategorySchema from './models/product-category.schema';
import productTagSchema from './models/product-tag.schema';
import productVariationSchema from './models/product-variation.schema';
import tagSchema from './models/tag.schema';

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
			version: 16,
			tables: [
				tableSchema(categorySchema),
				tableSchema(customerSchema),
				tableSchema(imageSchema),
				tableSchema(orderLineItemSchema),
				tableSchema(orderSchema),
				tableSchema(productSchema),
				tableSchema(productCategorySchema),
				tableSchema(productTagSchema),
				tableSchema(productVariationSchema),
				tableSchema(tagSchema),
			],
		}),
	});

	const database = await new Database({
		adapter,
		modelClasses: [
			Category,
			Customer,
			Image,
			Order,
			OrderLineItem,
			Product,
			ProductCategory,
			ProductTag,
			ProductVariation,
			Tag,
		],
		actionsEnabled: true,
	});

	return database;
};

export default store;
