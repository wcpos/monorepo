import * as React from 'react';

import useLocalData from '../contexts/local-data';

const useLogin = () => {
	const { userDB } = useLocalData();

	const login = React.useCallback(
		async ({ siteID, wpCredentialsID, storeID }) => {
			const current = await userDB.getLocal('current');
			await userDB.upsertLocal('current', {
				userID: current && current.get('userID'),
				siteID,
				wpCredentialsID,
				storeID,
			});
		},
		[userDB]
	);

	return login;
};

export default useLogin;
