import * as React from 'react';

import { StackActions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import EditProduct from './edit-product';
import EditVariation from './edit-variation';
import Products from './products';
import { t } from '../../../lib/translations';
import { ModalLayout } from '../../components/modal-layout';
import useUISettings from '../contexts/ui-settings';
import useCollection from '../hooks/use-collection';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type ProductsStackParamList = {
	Products: undefined;
	EditProduct: { productID: string };
	EditVariation: { parentID: string; variationID: string };
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
			<React.Suspense>
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
	const { collection } = useCollection('products');

	const resource = React.useMemo(
		() => new ObservableResource(from(collection.findOneFix(productID).exec())),
		[collection, productID]
	);

	return (
		<ModalLayout
			title={t('Edit', { _tags: 'core' })}
			secondaryActions={[
				{
					label: t('Cancel', { _tags: 'core' }),
					action: () => navigation.dispatch(StackActions.pop(1)),
				},
			]}
		>
			<React.Suspense>
				<EditProduct resource={resource} />
			</React.Suspense>
		</ModalLayout>
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
	const { uiSettings } = useUISettings('products');
	const { collection } = useCollection('variations');

	const resource = React.useMemo(
		() => new ObservableResource(from(collection.findOneFix(variationID).exec())),
		[collection, variationID]
	);

	/**
	 *
	 */
	return (
		<ModalLayout
			title={t('Edit Variation', { _tags: 'core' })}
			secondaryActions={[
				{
					label: t('Cancel', { _tags: 'core' }),
					action: () => navigation.dispatch(StackActions.pop(1)),
				},
			]}
		>
			<React.Suspense>
				<EditVariation resource={resource} />
			</React.Suspense>
		</ModalLayout>
	);
};

/**
 *
 */
const ProductsNavigator = () => {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Products" component={ProductsWithProviders} />
			<Stack.Group screenOptions={{ presentation: 'modal' }}>
				<Stack.Screen name="EditProduct" component={EditProductWithProviders} />
				<Stack.Screen name="EditVariation" component={EditVariationWithProviders} />
			</Stack.Group>
		</Stack.Navigator>
	);
};

export default ProductsNavigator;
