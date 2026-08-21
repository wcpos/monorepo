import { useLocalSearchParams } from 'expo-router';

import { EditVariationModal } from './modal';
import { useEngineRecord } from '../../../hooks/use-engine-document';

export function EditVariationScreen() {
	const { variationId } = useLocalSearchParams<{ variationId: string }>();
	const resource = useEngineRecord('variations', variationId);

	return <EditVariationModal resource={resource} />;
}
