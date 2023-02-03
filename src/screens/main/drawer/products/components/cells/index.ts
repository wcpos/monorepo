import Actions from './actions';
import DateCreated from './date-created';
import GroupedName from './grouped-name';
import Name from './name';
import Price from './price';
import RegularPrice from './regular-price';
import SalePrice from './sale-price';
import StockQuanity from './stock-quantity';
import VariablePrice from './variable-price';
import VariableRegularPrice from './variable-regular-price';
import VariableSalePrice from './variable-sale-price';
import Categories from '../../../../common/product-categories';
import Tag from '../../../../common/product-tags';
import { ProductImage } from '../../../components/product-image';

const simple = {
	actions: Actions,
	categories: Categories,
	image: ProductImage,
	name: Name,
	price: Price,
	regular_price: RegularPrice,
	sale_price: SalePrice,
	date_created: DateCreated,
	stock_quantity: StockQuanity,
	tag: Tag,
};

const variable = {
	price: VariablePrice,
	regular_price: VariableRegularPrice,
	sale_price: VariableSalePrice,
};

const grouped = {
	name: GroupedName,
};

export default { simple, variable, grouped };
