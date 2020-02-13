import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AuthNavigator from './auth';

export default function AppNavigator() {
	return (
		<NavigationContainer>
			<AuthNavigator />
		</NavigationContainer>
	);
}
