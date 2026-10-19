import { useLocalSearchParams } from 'expo-router';

import { useEngineRecord } from '@wcpos/query/record-readers';

import { EditProductModal } from './modal';

export function EditProductScreen() {
	const { productId } = useLocalSearchParams<{ productId: string }>();
	const resource = useEngineRecord('products', productId);

	return <EditProductModal resource={resource} />;
}
