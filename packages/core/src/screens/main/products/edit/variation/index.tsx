import { useLocalSearchParams } from 'expo-router';

import { EditVariationModal } from './modal';
import { useEngineDocument } from '../../../hooks/use-engine-document';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

export function EditVariationScreen() {
	const { variationId } = useLocalSearchParams<{ variationId: string }>();
	const resource = useEngineDocument<ProductVariationDocument>('variations', variationId);

	return <EditVariationModal resource={resource} />;
}
