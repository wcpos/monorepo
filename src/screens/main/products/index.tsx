import * as React from 'react';

import { StackActions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Text from '@wcpos/components/src/text';
import { useQuery } from '@wcpos/query';

import AddProduct from './add-product';
import EditProduct from './edit-product';
import EditVariation from './edit-variation';
import Products from './products';
import { useT } from '../../../contexts/translations';
import { ModalLayout } from '../../components/modal-layout';
import { TaxHelpersProvider } from '../contexts/tax-helpers';
import useUISettings from '../contexts/ui-settings';
import useBaseTaxLocation from '../hooks/use-base-tax-location';
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
	const location = useBaseTaxLocation();

	/**
	 *
	 */
	const taxQuery = useQuery({
		queryKeys: ['tax-rates', 'base'],
		collectionName: 'taxes',
		initialParams: {
			search: location,
		},
	});

	return (
		<ErrorBoundary>
			<Suspense>
				<TaxHelpersProvider taxQuery={taxQuery}>
					<Suspense>
						<Products />
					</Suspense>
				</TaxHelpersProvider>
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
	const t = useT();

	return (
		<ModalLayout
			title={t('Add Product', { _tags: 'core' })}
			primaryAction={{ label: t('Save to Server', { _tags: 'core' }) }}
			secondaryActions={[
				{
					label: t('Cancel', { _tags: 'core' }),
					action: () => navigation.dispatch(StackActions.pop(1)),
				},
			]}
		>
			<AddProduct />
		</ModalLayout>
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
	const { collection } = useCollection('products');
	const t = useT();

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
			<Suspense>
				<EditProduct resource={resource} />
			</Suspense>
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
	const { collection } = useCollection('variations');
	const t = useT();

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
			<Suspense>
				<EditVariation resource={resource} />
			</Suspense>
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
				<Stack.Screen name="AddProduct" component={AddProductModal} />
				<Stack.Screen name="EditProduct" component={EditProductWithProviders} />
				<Stack.Screen name="EditVariation" component={EditVariationWithProviders} />
			</Stack.Group>
		</Stack.Navigator>
	);
};

export default ProductsNavigator;
