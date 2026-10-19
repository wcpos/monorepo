import { useLocalSearchParams } from 'expo-router';

import { useEngineRecord } from '@wcpos/query/record-readers';

import { EditVariationModal } from './modal';

export function EditVariationScreen() {
	const { variationId } = useLocalSearchParams<{ variationId: string }>();
	const resource = useEngineRecord('variations', variationId);

	return <EditVariationModal resource={resource} />;
}
