import { useLocalSearchParams } from 'expo-router';

import { EditProductModal } from './modal';
import { useEngineRecord } from '../../../hooks/use-engine-document';

export function EditProductScreen() {
	const { productId } = useLocalSearchParams<{ productId: string }>();
	const resource = useEngineRecord('products', productId);

	return <EditProductModal resource={resource} />;
}
