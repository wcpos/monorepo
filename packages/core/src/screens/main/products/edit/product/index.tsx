import React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource } from 'observable-hooks';

import { EditProductModal } from './modal';
import { useCollection } from '../../../hooks/use-collection';

export const EditProductScreen = () => {
	const { productId } = useLocalSearchParams<{ productId: string }>();
	const { collection } = useCollection('products');
	const query = collection.findOneFix(productId);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	return <EditProductModal resource={resource} />;
};
