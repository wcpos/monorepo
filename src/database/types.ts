/**
 * Users Database
 */
export type UserDatabaseCollections = {
	logs: import('./logs/logs').LogCollection;
	users: import('./users/users').UserCollection;
	sites: import('./sites/sites').SiteCollection;
	wpcredentials: import('./wp-credentials/wp-credentials').WPCredentialsCollection;
	stores: import('./sites/sites').SiteCollection;
};
export type UserDatabase = import('rxdb').RxDatabase<UserDatabaseCollections>;

/**
 * Stores Database
 */
export type StoreDatabaseCollections = {
	products: import('./products/products').ProductCollection;
	orders: OrderCollection;
	line_items: OrderLineItemCollection;
	fee_lines: OrderFeeLineCollection;
	shipping_lines: OrderShippingLineCollection;
};
export type StoreDatabase = import('rxdb').RxDatabase<StoreDatabaseCollections>;
