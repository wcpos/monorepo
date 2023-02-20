import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import EditProduct from './edit-product';
import Products from './products';
import { t } from '../../../lib/translations';
import { ModalLayout } from '../../components/modal-layout';
import { ProductsProvider } from '../contexts/products';
import useUISettings from '../contexts/ui-settings';

export type ProductsStackParamList = {
	Products: undefined;
	EditProduct: { productID: string };
};

const Stack = createStackNavigator<ProductsStackParamList>();

/**
 *
 */
const ProductsNavigator = () => {
	const { uiSettings } = useUISettings('products');

	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Products">
				{() => (
					<ErrorBoundary>
						<React.Suspense fallback={<Text>Loading products</Text>}>
							<Products />
						</React.Suspense>
					</ErrorBoundary>
				)}
			</Stack.Screen>
			<Stack.Screen name="EditProduct" options={{ presentation: 'transparentModal' }}>
				{({ route }) => {
					const { productID } = route.params;
					return (
						<ProductsProvider
							initialQuery={{ selector: { uuid: productID }, limit: 1 }}
							uiSettings={uiSettings}
						>
							<ModalLayout title={t('Edit', { _tags: 'core' })}>
								<React.Suspense fallback={<Text>Loading product</Text>}>
									<EditProduct />
								</React.Suspense>
							</ModalLayout>
						</ProductsProvider>
					);
				}}
			</Stack.Screen>
		</Stack.Navigator>
	);
};

export default ProductsNavigator;
