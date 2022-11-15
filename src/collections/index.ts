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
import taxes from './taxes';
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
	taxes,
	payment_gateways,
};
