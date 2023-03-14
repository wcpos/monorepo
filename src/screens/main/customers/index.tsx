import * as React from 'react';

import { useNavigation, StackActions } from '@react-navigation/native';
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

export type CustomersStackParamList = {
	Customers: undefined;
	AddCustomer: undefined;
	EditCustomer: { customerID: string };
};

const Stack = createStackNavigator<CustomersStackParamList>();

/**
 *
 */
const CustomersNavigator = () => {
	const navigation = useNavigation();

	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Customers">
				{() => (
					<ErrorBoundary>
						<React.Suspense fallback={<Text>Loading customers</Text>}>
							<Customers />
						</React.Suspense>
					</ErrorBoundary>
				)}
			</Stack.Screen>
			<Stack.Screen name="AddCustomer" options={{ presentation: 'transparentModal' }}>
				{() => (
					<ModalLayout title={t('Add Customer', { _tags: 'core' })}>
						<AddCustomer />
					</ModalLayout>
				)}
			</Stack.Screen>
			<Stack.Screen name="EditCustomer" options={{ presentation: 'transparentModal' }}>
				{({ route }) => {
					const customerID = get(route, ['params', 'customerID']);
					return (
						<CustomersProvider initialQuery={{ selector: { uuid: customerID }, limit: 1 }}>
							<ModalLayout
								title={t('Edit Customer', { _tags: 'core' })}
								primaryAction={{ label: t('Sync to Server', { _tags: 'core' }) }}
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
				}}
			</Stack.Screen>
		</Stack.Navigator>
	);
};

export default CustomersNavigator;
