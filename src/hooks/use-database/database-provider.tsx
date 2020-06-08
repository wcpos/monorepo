import React from 'react';
import { usersDatabase, getStoreDatabase } from '../../database';

const getLastUserHash = async () => {
	const hash = await usersDatabase.adapter.getLocal('last_user_hash');
	try {
		const obj = JSON.parse(hash || '');
		if (obj && typeof obj === 'object') {
			return obj;
		}
	} catch (e) {
		console.log(e);
	}
};

const storeLastUserHash = async (obj: {}) => {
	return await usersDatabase.adapter.setLocal('last_user_hash', JSON.stringify(obj));
};

export const DatabaseContext = React.createContext({
	user: undefined,
	// site: undefined,
	storeDB: undefined,
	setStoreDB: undefined,
});

type Props = {
	children: React.ReactNode;
};

/**
 *
 */
const DatabaseProvider = ({ children }: Props) => {
	const [user, setUser] = React.useState();
	const [wpUser, setWpUser] = React.useState();
	const [site, setSite] = React.useState();
	const [storeDB, _setStoreDB] = React.useState();
	// const store = undefined;

	// fetch last Store Hash on init
	React.useEffect(() => {
		const getLastUser = async () => {
			const userCollection = usersDatabase.collections.get('users');
			const hash = await getLastUserHash();
			const userCount = await userCollection.query().fetchCount();

			if (!hash && userCount === 0) {
				// create new user
				await usersDatabase.action(async () => {
					const newUser = await userCollection.create((user) => {
						user.display_name = 'New User';
					});
					setUser(newUser);
				});
			}

			if (!hash && userCount === 1) {
				const allUsers = await userCollection.query().fetch();
				setUser(allUsers[0]);
			}

			if (hash) {
				const user = await userCollection.find(hash.user);
				const site = await usersDatabase.collections.get('sites').find(hash.site);
				const wpUser = await usersDatabase.collections.get('wp_users').find(hash.wp_user);
				const database = getStoreDatabase(hash);
				setUser(user);
				_setStoreDB(database);
				setSite(site);
				setWpUser(wpUser);
			}
		};

		getLastUser();
	}, []);

	const setStoreDB = (obj) => {
		const database = getStoreDatabase(obj);
		_setStoreDB(database);
		storeLastUserHash(obj);
	};

	return (
		<DatabaseContext.Provider value={{ user, storeDB, setStoreDB, wpUser, site }}>
			{children}
		</DatabaseContext.Provider>
	);
};

export default DatabaseProvider;
