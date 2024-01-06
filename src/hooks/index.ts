import * as categories from './categories';
import * as customers from './customers';
import * as orders from './orders';
import * as products from './products';
import * as tags from './tags';
import * as taxRates from './tax-rates';
import * as variations from './variations';

export default {
	'products/categories': categories,
	customers,
	orders,
	products,
	'products/tags': tags,
	taxes: taxRates,
	variations,
};
