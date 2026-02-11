import React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource } from 'observable-hooks';

import { EditVariationModal } from './modal';
import { useCollection } from '../../../hooks/use-collection';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

export function EditVariationScreen() {
	const { variationId } = useLocalSearchParams<{ variationId: string }>();
	const { collection } = useCollection('variations');
	const query = collection.findOneFix(variationId);

	const resource = React.useMemo(
		() =>
			new ObservableResource<ProductVariationDocument>(
				query.$ as import('rxjs').Observable<ProductVariationDocument>
			),
		[query]
	);

	return <EditVariationModal resource={resource} />;
}
