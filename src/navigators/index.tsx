import * as React from 'react';
import { NavigationNativeContainer } from '@react-navigation/native';
import AuthNavigator from './auth';

export default function AppNavigator() {
	return (
		<NavigationNativeContainer>
			<AuthNavigator />
		</NavigationNativeContainer>
	);
}
