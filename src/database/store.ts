import { Database, appSchema, tableSchema } from '@nozbe/watermelondb';
import hash from 'hash-sum';
import Adapter from './adapter';
import Address from './models/address';
import Attribute from './models/attribute';
import Category from './models/category';
import Customer from './models/customer';
import CustomerMeta from './models/customer-meta';
import Image from './models/image';
import Meta from './models/meta';
import Order from './models/order';
import OrderLineItem from './models/order-line-item';
import Product from './models/product';
import ProductAttribute from './models/product-attribute';
import ProductCategory from './models/product-category';
import ProductMeta from './models/product-meta';
import ProductTag from './models/product-tag';
import ProductVariation from './models/product-variation';
import Tag from './models/tag';
import addressSchema from './models/address.schema';
import attributeSchema from './models/attribute.schema';
import categorySchema from './models/category.schema';
import customerSchema from './models/customer.schema';
import customerMetaSchema from './models/customer-meta.schema';
import imageSchema from './models/image.schema';
import metaSchema from './models/meta.schema';
import orderLineItemSchema from './models/order-line-item.schema';
import orderSchema from './models/order.schema';
import productAttributeSchema from './models/product-attribute.schema';
import productCategorySchema from './models/product-category.schema';
import productMetaSchema from './models/product-meta.schema';
import productSchema from './models/product.schema';
import productTagSchema from './models/product-tag.schema';
import productVariationSchema from './models/product-variation.schema';
import tagSchema from './models/tag.schema';

type Props = {
	site?: string;
	user?: string;
	store?: string;
};

const store = (obj: Props) => {
	if (!obj.site || !obj.user) {
		return;
	}

	const dbName = hash(obj);

	const adapter = new Adapter({
		dbName,
		schema: appSchema({
			version: 23,
			tables: [
				tableSchema(addressSchema),
				tableSchema(attributeSchema),
				tableSchema(categorySchema),
				tableSchema(customerSchema),
				tableSchema(customerMetaSchema),
				tableSchema(imageSchema),
				tableSchema(metaSchema),
				tableSchema(orderLineItemSchema),
				tableSchema(orderSchema),
				tableSchema(productAttributeSchema),
				tableSchema(productCategorySchema),
				tableSchema(productMetaSchema),
				tableSchema(productSchema),
				tableSchema(productTagSchema),
				tableSchema(productVariationSchema),
				tableSchema(tagSchema),
			],
		}),
	});

	const database = new Database({
		adapter,
		modelClasses: [
			Address,
			Attribute,
			Category,
			Customer,
			CustomerMeta,
			Image,
			Meta,
			Order,
			OrderLineItem,
			Product,
			ProductAttribute,
			ProductCategory,
			ProductMeta,
			ProductTag,
			ProductVariation,
			Tag,
		],
		actionsEnabled: true,
	});

	return database;
};

export default store;
