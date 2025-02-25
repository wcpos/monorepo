import React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource } from 'observable-hooks';

import { EditVariationModal } from './modal';
import { useCollection } from '../../../hooks/use-collection';

export const EditVariationScreen = () => {
	const { variationId } = useLocalSearchParams<{ variationId: string }>();
	const { collection } = useCollection('products');
	const query = collection.findOneFix(variationId);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	return <EditVariationModal resource={resource} />;
};
