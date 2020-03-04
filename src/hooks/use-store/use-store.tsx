import React from 'react';
import useLastUser from '../use-last-user';
import { storeDatabase } from '../../database/';

export const useStore = () => {
	const [user] = useLastUser();
	const [storeDB, setStoreDB] = React.useState();

	if (!storeDB && user?.site_id && user?.id) {
		const storeDB = storeDatabase({ site: user.site_id, user: user.id });

		if (storeDB) {
			setStoreDB(storeDB);
		}
	}

	return storeDB;
};

export default useStore;
