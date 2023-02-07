import * as React from 'react';

import EditForm from '../components/edit-form';
import { useProducts } from '../contexts/products/use-products';

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
