import * as React from 'react';
import { WpCredentialsContext } from './wp-credentials-provider';

const useWpCredentials = () => {
	const context = React.useContext(WpCredentialsContext);
	if (context === undefined) {
		throw new Error(`useWpCredentials must be called within WpCredentialsProvider`);
	}
	return context;
};

export default useWpCredentials;
