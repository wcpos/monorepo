import * as React from 'react';
import { UserContext } from './user-provider';

const useUser = () => {
	const context = React.useContext(UserContext);
	if (context === undefined) {
		throw new Error(`useUser must be called within UserProvider`);
	}
	return context;
};

export default useUser;
