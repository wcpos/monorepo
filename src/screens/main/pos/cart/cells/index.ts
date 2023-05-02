import { Actions } from './actions';
import { FeeName } from './fee-name';
import { FeeTotal } from './fee-total';
import { Price } from './price';
import { ProductName } from './product-name';
import { ProductTotal } from './product-total';
import { Quantity } from './quantity';
import { ShippingTitle } from './shipping-title';
import { ShippingTotal } from './shipping-total';
import { Subtotal } from './subtotal';

const line_items = {
	actions: Actions,
	name: ProductName,
	price: Price,
	quantity: Quantity,
	subtotal: Subtotal,
	total: ProductTotal,
};

const fee_lines = {
	actions: Actions,
	name: FeeName,
	price: () => null,
	subtotal: () => null,
	total: FeeTotal,
};

const shipping_lines = {
	actions: Actions,
	name: ShippingTitle,
	price: () => null,
	subtotal: () => null,
	total: ShippingTotal,
};

export { line_items, fee_lines, shipping_lines };
