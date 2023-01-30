import * as React from 'react';

import { useProducts } from '../../../../contexts/products/use-products';
import EditForm from '../../common/edit-form';

const EditProduct = () => {
	const { data: product } = useProducts();
	const schema = {};

	if (!product) {
		return null;
	}

	return (
		<EditForm
			item={product}
			schema={product.collection.schema.jsonSchema}
			// uiSchema={}
		/>
	);
};

export default EditProduct;
