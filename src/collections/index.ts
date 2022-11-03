import logs from './logs';
import users from './users';
import sites from './sites';
import wp_credentials from './wp-credentials';
import stores from './stores';
import products from './products';
import variations from './variations';
import orders from './orders';
import line_items from './line-items';
import fee_lines from './fee-lines';
import shipping_lines from './shipping-lines';
import customers from './customers';
import taxes from './taxes';
import payment_gateways from './payment-gateways';

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
