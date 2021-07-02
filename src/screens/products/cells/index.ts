import image from './image';
import name from './name';
import categories from '../../common/product-categories';
import tags from '../../common/product-tags';
import Price from '../../common/price';
import actions from './actions';
import dateCreated from '../../common/date';

export default {
	image,
	name,
	categories,
	tags,
	regularPrice: Price,
	salePrice: Price,
	actions,
	dateCreated,
};
