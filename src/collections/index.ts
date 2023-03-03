import categories from './categories';
import customers from './customers';
import fee_lines from './fee-lines';
import line_items from './line-items';
import logs from './logs';
import orders from './orders';
import payment_gateways from './payment-gateways';
import products from './products';
import shipping_lines from './shipping-lines';
import sites from './sites';
import stores from './stores';
import tags from './tags';
import taxes from './tax-rates';
import users from './users';
import variations from './variations';
import wp_credentials from './wp-credentials';

export const userCollections = { logs, users, sites, wp_credentials, stores };

export const storeCollections = {
	products,
	variations,
	orders,
	line_items,
	fee_lines,
	shipping_lines,
	customers,
	taxes, // NOTE: WC REST API uses 'taxes', not 'tax_rates', going against all other endpoints.
	payment_gateways,
	'products/categories': categories, // NOTE: WC REST API uses 'products/categories' endpoint
	'products/tags': tags, // NOTE: WC REST API uses 'products/tags' endpoint
};
