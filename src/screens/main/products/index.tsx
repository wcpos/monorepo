import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import EditProduct from './edit-product';
import Products from './products';
import { ModalLayout } from '../../components/modal-layout';
import { ProductsProvider } from '../contexts/products';

export type ProductsStackParamList = {
	Products: undefined;
	EditProduct: { productID: string };
};

const Stack = createStackNavigator<ProductsStackParamList>();

export const productsStackRoutes = {
	path: 'products',
	screens: {
		Products: {
			path: '',
		},
		EditProduct: {
			path: 'edit/:productID',
		},
	},
};

/**
 *
 */
const ProductsNavigator = () => {
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
						<ProductsProvider initialQuery={{ filters: { uuid: productID } }}>
							<ModalLayout>
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
