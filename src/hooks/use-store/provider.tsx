import React from 'react';
import useUser from '../use-user';
import { storeDatabase } from '../../database/';

export const StoreContext = React.createContext();

interface Props {
	children: React.ReactNode;
}

/**
 *
 */
const StoreProvider: React.FC<Props> = ({ children }) => {
	// const [store, setStore] = React.useState();
	// const { user } = useUser();

	// if (!store && user?.site_id && user?.id) {
	// 	const storeDB = storeDatabase({ site: user.site_id, user: user.id });

	// 	if (storeDB) {
	// 		setStore(storeDB);
	// 	}
	// }

	const store = storeDatabase({ site: 'test', user: 'test' });

	return <StoreContext.Provider value={{ store }}>{children}</StoreContext.Provider>;
};

export default StoreProvider;
