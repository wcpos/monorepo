import React, { createContext, useState, useEffect } from 'react';
import { sitesDatabase, storeDatabase } from '../../database/';

export const DatabaseContext = createContext({});

type Props = {
	children: React.ReactNode;
};

/**
 *
 */
const DatabaseProvider = ({ children }: Props) => {
	const [lastUser, setLastUser] = useState({ site: undefined, user: undefined, store: undefined });
	const [storeDB, setStoreDB] = useState();

	// fetch last Store Hash on init
	useEffect(() => {
		const getLastHash = async () => {
			const lastUser = await sitesDatabase.adapter.getLocal('last_user');
			if (lastUser) {
				setLastUser(JSON.parse(lastUser));
			}
		};

		getLastHash();
	}, []);

	// init store database
	useEffect(() => {
		const initDB = async () => {
			if (lastUser.user) {
				const user = await sitesDatabase.collections.get('users').find(lastUser.user);
				console.log(user);
			}

			const storeDB = await storeDatabase(lastUser);

			if (storeDB) {
				setStoreDB(storeDB);
			}
		};

		initDB();
	}, [lastUser]);

	const switchStoreDB = async (obj: {}) => {
		setLastUser(obj);
		await sitesDatabase.adapter.setLocal('last_user', JSON.stringify(obj));
	};

	return (
		<DatabaseContext.Provider value={{ sitesDB: sitesDatabase, storeDB, switchStoreDB, lastUser }}>
			{children}
		</DatabaseContext.Provider>
	);
};

export default DatabaseProvider;
