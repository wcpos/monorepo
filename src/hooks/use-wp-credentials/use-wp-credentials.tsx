import * as React from 'react';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { WpCredentialsContext } from './wp-credentials-provider';

const useWpCredentials = () => {
	const context = React.useContext(WpCredentialsContext);
	if (context === undefined) {
		throw new Error(`useWpCredentials must be called within WpCredentialsProvider`);
	}

	const { wpCredentialsResource } = context;
	const wpCredentials = useObservableSuspense(wpCredentialsResource);

	return { wpCredentials, wpCredentialsResource };
};

export default useWpCredentials;
