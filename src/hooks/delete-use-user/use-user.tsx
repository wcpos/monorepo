import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { UserContext } from './user-provider';

const useUser = () => {
	const context = React.useContext(UserContext);
	if (context === undefined) {
		throw new Error(`useUser must be called within UserProvider`);
	}

	const { userDB, userResource } = context;
	const user = useObservableSuspense(userResource);

	return { user, userDB, userResource };
};

export default useUser;
