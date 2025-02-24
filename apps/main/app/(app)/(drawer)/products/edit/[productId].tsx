import React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource } from 'observable-hooks';

import { useCollection } from '@wcpos/core/screens/main/hooks/use-collection';
import { EditProduct } from '@wcpos/core/screens/main/products/edit-product';

export default function EditProductScreen() {
	const { productId } = useLocalSearchParams<{ productId: string }>();
	const { collection } = useCollection('products');
	const query = collection.findOneFix(productId);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	return <EditProduct resource={resource} />;
}
