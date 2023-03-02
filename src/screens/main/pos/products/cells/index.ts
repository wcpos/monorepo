import { Actions } from './actions';
import { Name } from './name';
import { Price } from './price';
import { SKU } from './sku';
import { StockQuantity } from './stock-quantity';
import { VariableActions } from './variable-actions';
import { VariablePrice } from './variable-price';
import { ProductImage } from '../../../components/product/image';

const simple = {
	actions: Actions,
	image: ProductImage,
	name: Name,
	price: Price,
	sku: SKU,
	stock_quantity: StockQuantity,
};

const variable = {
	actions: VariableActions,
	image: ProductImage,
	name: Name,
	price: VariablePrice,
	sku: SKU,
	stock_quantity: StockQuantity,
};

const grouped = {};

export default { simple, variable, grouped };
