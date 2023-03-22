import * as React from 'react';

import { StackActions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import get from 'lodash/get';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import AddCustomer from './add-customer';
import Customers from './customers';
import EditCustomer from './edit-customer';
import { t } from '../../../lib/translations';
import { ModalLayout } from '../../components/modal-layout';
import { CustomersProvider } from '../contexts/customers';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type CustomersStackParamList = {
	Customers: undefined;
	AddCustomer: undefined;
	EditCustomer: { customerID: string };
};

const Stack = createStackNavigator<CustomersStackParamList>();

/**
 *
 */
const CustomersWithProviders = () => {
	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>Loading customers</Text>}>
				<Customers />
			</React.Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const AddCustomerWithProviders = ({
	navigation,
}: NativeStackScreenProps<CustomersStackParamList, 'AddCustomer'>) => {
	return (
		<ModalLayout
			title={t('Add Customer', { _tags: 'core' })}
			primaryAction={{ label: t('Save to Server', { _tags: 'core' }) }}
			secondaryActions={[
				{
					label: t('Cancel', { _tags: 'core' }),
					action: () => navigation.dispatch(StackActions.pop(1)),
				},
			]}
		>
			<AddCustomer />
		</ModalLayout>
	);
};

/**
 *
 */
const EditCustomerWithProviders = ({
	route,
	navigation,
}: NativeStackScreenProps<CustomersStackParamList, 'EditCustomer'>) => {
	const customerID = get(route, ['params', 'customerID']);

	const initialQuery = React.useMemo(
		() => ({
			selector: { uuid: customerID },
			limit: 1,
		}),
		[customerID]
	);

	return (
		<CustomersProvider initialQuery={initialQuery}>
			<ModalLayout
				title={t('Edit Customer', { _tags: 'core' })}
				primaryAction={{ label: t('Save to Server', { _tags: 'core' }) }}
				secondaryActions={[
					{
						label: t('Cancel', { _tags: 'core' }),
						action: () => navigation.dispatch(StackActions.pop(1)),
					},
				]}
			>
				<React.Suspense fallback={<Text>Loading customer</Text>}>
					<EditCustomer />
				</React.Suspense>
			</ModalLayout>
		</CustomersProvider>
	);
};

/**
 *
 */
const CustomersNavigator = () => {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Customers" component={CustomersWithProviders} />
			<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
				<Stack.Screen name="AddCustomer" component={AddCustomerWithProviders} />
				<Stack.Screen name="EditCustomer" component={EditCustomerWithProviders} />
			</Stack.Group>
		</Stack.Navigator>
	);
};

export default CustomersNavigator;
