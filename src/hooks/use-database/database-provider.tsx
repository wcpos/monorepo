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

	const switchStoreDB = async (obj: {}) => {
		const lastUser = await sitesDatabase.adapter.setLocal('store_db', JSON.stringify(obj));
		setLastUser(lastUser);
	};

	return (
		<DatabaseContext.Provider
			value={{ sitesDB: sitesDatabase, storeDB: storeDatabase(lastUser), switchStoreDB, lastUser }}
		>
			{children}
		</DatabaseContext.Provider>
	);
};

export default DatabaseProvider;
