import { useLocalSearchParams } from 'expo-router';

import { EditProductModal } from './modal';
import { useEngineDocument } from '../../../hooks/use-engine-document';

type ProductDocument = import('@wcpos/database').ProductDocument;

export function EditProductScreen() {
	const { productId } = useLocalSearchParams<{ productId: string }>();
	const resource = useEngineDocument<ProductDocument>('products', productId);

	return <EditProductModal resource={resource} />;
}
