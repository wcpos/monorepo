import { Actions } from './actions';
import { FeeAndShippingPrice } from './fee-and-shipping-price';
import { FeeName } from './fee-name';
import { Price } from './price';
import { ProductName } from './product-name';
import { Quantity } from './quantity';
import { ShippingTitle } from './shipping-title';
import { Tax } from './tax';
import { Total } from './total';

const line_items = {
	actions: Actions,
	name: ProductName,
	price: Price,
	quantity: Quantity,
	subtotal: Total,
	subtotal_tax: Tax,
	total: Total,
	total_tax: Tax,
};

const fee_lines = {
	actions: Actions,
	name: FeeName,
	price: FeeAndShippingPrice,
	total: Total,
	total_tax: Tax,
};

const shipping_lines = {
	actions: Actions,
	name: ShippingTitle,
	price: FeeAndShippingPrice,
	total: Total,
	total_tax: Tax,
};

export { line_items, fee_lines, shipping_lines };
