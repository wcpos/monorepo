import createProductsCollection from './products';
import createOrdersCollection from './orders';
import createOrderLineItemsCollection from './orders/line-items';
import createCustomersCollection from './customers';

export default [
	createProductsCollection,
	createOrdersCollection,
	createOrderLineItemsCollection,
	createCustomersCollection,
];
