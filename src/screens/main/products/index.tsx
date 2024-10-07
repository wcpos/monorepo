import * as React from 'react';

import { StackActions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { AddProduct } from './add-product';
import { EditProduct } from './edit-product';
import { EditVariation } from './edit-variation';
import Products from './products';
import { TaxRatesProvider } from '../contexts/tax-rates';
import { useCollection } from '../hooks/use-collection';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type ProductsStackParamList = {
	Products: undefined;
	AddProduct: undefined;
	EditProduct: { productID: string };
	EditVariation: { parentID: string; variationID: string };
};

const Stack = createStackNavigator<ProductsStackParamList>();

/**
 * TODO: move the Products provider here
 */
const ProductsWithProviders = () => {
	/**
	 *
	 */
	const taxQuery = useQuery({
		queryKeys: ['tax-rates'],
		collectionName: 'taxes',
	});

	return (
		<ErrorBoundary>
			<Suspense>
				<TaxRatesProvider taxQuery={taxQuery}>
					<Suspense>
						<Products />
					</Suspense>
				</TaxRatesProvider>
			</Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const AddProductModal = ({
	navigation,
}: NativeStackScreenProps<ProductsStackParamList, 'AddProduct'>) => {
	return <AddProduct />;
};

/**
 *
 */
const EditProductWithProviders = ({
	route,
	navigation,
}: NativeStackScreenProps<ProductsStackParamList, 'EditProduct'>) => {
	const { productID } = route.params;
	const { collection } = useCollection('products');
	const query = collection.findOneFix(productID);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	return (
		<ErrorBoundary>
			<Suspense>
				<EditProduct resource={resource} />
			</Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const EditVariationWithProviders = ({
	route,
	navigation,
}: NativeStackScreenProps<ProductsStackParamList, 'EditVariation'>) => {
	const { variationID, parentID } = route.params;
	const { collection } = useCollection('variations');
	const query = collection.findOneFix(variationID);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	/**
	 *
	 */
	return (
		<ErrorBoundary>
			<Suspense>
				<EditVariation resource={resource} />
			</Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const ProductsNavigator = () => {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Products" component={ProductsWithProviders} />
			<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
				<Stack.Screen name="AddProduct" component={AddProductModal} />
				<Stack.Screen name="EditProduct" component={EditProductWithProviders} />
				<Stack.Screen name="EditVariation" component={EditVariationWithProviders} />
			</Stack.Group>
		</Stack.Navigator>
	);
};

export default ProductsNavigator;
