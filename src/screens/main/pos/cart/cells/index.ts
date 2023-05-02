import { Actions } from './actions';
import { FeeAndShippingPrice } from './fee-and-shipping-price';
import { FeeAndShippingTotal } from './fee-and-shipping-total';
import { FeeName } from './fee-name';
import { Price } from './price';
import { PriceTotal } from './price-total';
import { ProductName } from './product-name';
import { Quantity } from './quantity';
import { ShippingTitle } from './shipping-title';
import { Subtotal } from './subtotal';

const line_items = {
	actions: Actions,
	name: ProductName,
	price: Price,
	quantity: Quantity,
	subtotal: Subtotal,
	total: PriceTotal,
};

const fee_lines = {
	actions: Actions,
	name: FeeName,
	price: FeeAndShippingPrice,
	total: FeeAndShippingTotal,
};

const shipping_lines = {
	actions: Actions,
	name: ShippingTitle,
	price: FeeAndShippingPrice,
	total: FeeAndShippingTotal,
};

export { line_items, fee_lines, shipping_lines };
