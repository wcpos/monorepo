import * as React from 'react';

import { StackActions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import EditProduct from './edit-product';
import Products from './products';
import { t } from '../../../lib/translations';
import { ModalLayout } from '../../components/modal-layout';
import { ProductsProvider } from '../contexts/products';
import useUISettings from '../contexts/ui-settings';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type ProductsStackParamList = {
	Products: undefined;
	EditProduct: { productID: string };
};

const Stack = createStackNavigator<ProductsStackParamList>();

/**
 * TODO: move the Products provider here
 */
const ProductsWithProviders = ({
	route,
}: NativeStackScreenProps<ProductsStackParamList, 'Products'>) => {
	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>Loading products</Text>}>
				<Products />
			</React.Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const EditProductWithProviders = ({
	route,
	navigation,
}: NativeStackScreenProps<ProductsStackParamList, 'EditProduct'>) => {
	const { productID } = route.params;
	const { uiSettings } = useUISettings('products');

	const initialQuery = React.useMemo(
		() => ({
			selector: { uuid: productID },
			limit: 1,
		}),
		[productID]
	);

	return (
		<ProductsProvider initialQuery={initialQuery} uiSettings={uiSettings}>
			<ModalLayout
				title={t('Edit', { _tags: 'core' })}
				primaryAction={{ label: t('Save to Server', { _tags: 'core' }) }}
				secondaryActions={[
					{
						label: t('Cancel', { _tags: 'core' }),
						action: () => navigation.dispatch(StackActions.pop(1)),
					},
				]}
			>
				<React.Suspense fallback={<Text>Loading product</Text>}>
					<EditProduct />
				</React.Suspense>
			</ModalLayout>
		</ProductsProvider>
	);
};

/**
 *
 */
const ProductsNavigator = () => {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Products" component={ProductsWithProviders} />
			<Stack.Screen
				name="EditProduct"
				options={{ presentation: 'transparentModal' }}
				component={EditProductWithProviders}
			/>
		</Stack.Navigator>
	);
};

export default ProductsNavigator;
