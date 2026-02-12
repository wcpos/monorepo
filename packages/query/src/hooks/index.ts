import * as categories from './categories';
import * as coupons from './coupons';
import * as customers from './customers';
import * as orders from './orders';
import * as products from './products';
import * as tags from './tags';
import * as taxRates from './tax-rates';
import * as variations from './variations';

export const allHooks = {
	'products/categories': categories,
	coupons,
	customers,
	orders,
	products,
	'products/tags': tags,
	taxes: taxRates,
	variations,
};
