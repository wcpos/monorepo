import * as React from 'react';

import useLocalData from '../contexts/local-data';

const useLogout = () => {
	const { userDB } = useLocalData();

	const logout = React.useCallback(async () => {
		const current = await userDB.getLocal('current');
		userDB.upsertLocal('current', {
			userID: current && current.get('userID'),
			siteID: null,
			wpCredentialsID: null,
			storeID: null,
		});
	}, [userDB]);

	return logout;
};

export default useLogout;
