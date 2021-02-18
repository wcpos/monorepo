/**
 * Users Database
 */
export type UserDatabaseCollections = {
	logs: LogCollection;
	users: UserCollection;
};
export type UserDatabase = import('rxdb').RxDatabase<UserDatabaseCollections>;

/**
 * Users
 */
export type UserSchema = import('./users/interface').UserSchema;
export type UserDocument = import('rxdb').RxDocument<
	UserSchema,
	typeof import('./stores/orders/methods')
>;
export type UserCollection = import('rxdb').RxCollection<
	UserDocument,
	typeof import('./stores/orders/methods'),
	typeof import('./stores/orders/statics')
>;

/**
 * Logs
 */
export type LogSchema = import('./users/logs/interface').LogSchema;
export type LogDocument = import('rxdb').RxDocument<LogSchema, { [key: string]: any }>;
export type LogCollection = import('rxdb').RxCollection<
	LogDocument,
	{ [key: string]: any },
	{ [key: string]: any }
>;

/**
 * Stores Database
 */
export type StoreDatabaseCollections = {
	products: ProductCollection;
	orders: OrderCollection;
};
export type StoreDatabase = import('rxdb').RxDatabase<StoreDatabaseCollections>;

/**
 * Products
 */
export type ProductSchema = import('./stores/products/interface').WooCommerceProductSchema;
export type ProductDocument = import('rxdb').RxDocument<
	ProductSchema,
	typeof import('./stores/products/methods')
>;
export type ProductCollection = import('rxdb').RxCollection<
	ProductDocument,
	typeof import('./stores/products/methods'),
	typeof import('./stores/products/statics')
>;

/**
 * Orders
 */
export type OrderSchema = import('./stores/orders/interface').WooCommerceOrderSchema;
export type OrderDocument = import('rxdb').RxDocument<
	OrderSchema,
	typeof import('./stores/orders/methods')
>;
export type OrderCollection = import('rxdb').RxCollection<
	OrderDocument,
	typeof import('./stores/orders/methods'),
	typeof import('./stores/orders/statics')
>;

/**
 * Order Line Items
 */
export type OrderLineItemSchema = import('./stores/orders/line-items/interface').WooCommerceOrderLineItemSchema;
export type OrderLineItemDocument = import('rxdb').RxDocument<
	OrderLineItemSchema,
	typeof import('./stores/orders/methods')
>;
export type OrderLineItemCollection = import('rxdb').RxCollection<
	OrderLineItemDocument,
	typeof import('./stores/orders/methods'),
	typeof import('./stores/orders/statics')
>;

/**
 * Order Fee Lines
 */
export type OrderFeeLineSchema = import('./stores/orders/fee-lines/interface').WooCommerceOrderFeeLineSchema;
export type OrderFeeLineDocument = import('rxdb').RxDocument<
	OrderFeeLineSchema,
	typeof import('./stores/orders/fee-lines/fee-lines').methods
>;
export type OrderFeeLineCollection = import('rxdb').RxCollection<
	OrderFeeLineDocument,
	typeof import('./stores/orders/fee-lines/fee-lines').methods,
	typeof import('./stores/orders/fee-lines/fee-lines').statics
>;

/**
 * Order Shipping Lines
 */
export type OrderShippingLineSchema = import('./stores/orders/shipping-lines/interface').WooCommerceOrderShippingLineSchema;
export type OrderShippingLineDocument = import('rxdb').RxDocument<
	OrderShippingLineSchema,
	typeof import('./stores/orders/shipping-lines/shipping-lines').methods
>;
export type OrderShippingLineCollection = import('rxdb').RxCollection<
	OrderShippingLineDocument,
	typeof import('./stores/orders/shipping-lines/shipping-lines').methods,
	typeof import('./stores/orders/shipping-lines/shipping-lines').statics
>;

/**
 * Customers
 */
export type CustomerSchema = import('./stores/customers/interface').WooCommerceCustomerSchema;
export type CustomerDocument = import('rxdb').RxDocument<
	CustomerSchema,
	typeof import('./stores/customers/customers').methods
>;
export type CustomerCollection = import('rxdb').RxCollection<
	CustomerDocument,
	typeof import('./stores/customers/customers').methods,
	typeof import('./stores/customers/customers').statics
>;
