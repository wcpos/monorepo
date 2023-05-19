import * as React from 'react';

import { StackActions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import EditProduct from './edit-product';
import EditVariation from './edit-variation';
import Products from './products';
import { t } from '../../../lib/translations';
import { ModalLayout } from '../../components/modal-layout';
import { ProductsProvider } from '../contexts/products';
import useUISettings from '../contexts/ui-settings';
import { VariationsProvider } from '../contexts/variations';
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
				secondaryActions={[
					{
						label: t('Cancel', { _tags: 'core' }),
						action: () => navigation.dispatch(StackActions.pop(1)),
					},
				]}
			>
				<React.Suspense>
					<EditProduct />
				</React.Suspense>
			</ModalLayout>
		</ProductsProvider>
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
	const productCollection = useCollection('products');
	const [parent, setParent] = React.useState<import('@wcpos/database').ProductDocument>();

	/**
	 * I need to get the parent product here, so I can pass it to the variations provider
	 */
	React.useEffect(() => {
		productCollection
			.findOneFix({ selector: { id: parseInt(parentID, 10) } })
			.exec()
			.then((doc) => {
				setParent(doc);
			});
	}, [parentID, productCollection]);

	/**
	 *
	 */
	const initialQuery = React.useMemo(
		() => ({
			selector: { uuid: variationID },
			limit: 1,
		}),
		[variationID]
	);

	/**
	 *
	 */
	if (!parent) {
		return <Text>Loading...</Text>;
	}

	/**
	 *
	 */
	return (
		<VariationsProvider initialQuery={initialQuery} parent={parent} uiSettings={uiSettings}>
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
					<EditVariation />
				</React.Suspense>
			</ModalLayout>
		</VariationsProvider>
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
