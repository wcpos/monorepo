import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { AuthContext } from './auth-provider';

export const useAuth = () => {
	const context = React.useContext(AuthContext);
	if (!context) {
		throw new Error(`useAuth must be called within AuthProvider`);
	}

	return context;
};
