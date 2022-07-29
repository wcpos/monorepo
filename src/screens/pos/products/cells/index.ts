import { Actions } from './actions';
import { Image } from './image';
import { Name } from './name';
import { Price } from './price';
import { SKU } from './sku';
import { StockQuantity } from './stock-quantity';
import { VariableActions } from './variable-actions';

const simple = {
	actions: Actions,
	image: Image,
	name: Name,
	price: Price,
	sku: SKU,
	stock_quantity: StockQuantity,
};

const variable = {
	actions: VariableActions,
	image: Image,
	name: Name,
	price: Price,
	sku: SKU,
	stock_quantity: StockQuantity,
};

export default { simple, variable };
