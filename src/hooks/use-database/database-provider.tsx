import React from 'react';
import { usersDatabase, getStoreDatabase } from '../../database/';

// const getLastUser = async () => {
// 	const user = await usersDatabase.adapter.getLocal('last_user');
// 	return user && JSON.parse(user);
// };

// const storeLastUser = async (obj: {}) => {
// 	return await usersDatabase.adapter.setLocal('last_user', JSON.stringify(obj));
// };

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
	// const site = undefined;
	const [storeDB, _setStoreDB] = React.useState();
	// const store = undefined;

	// fetch last Store Hash on init
	React.useEffect(() => {
		const getLastUser = async () => {
			const userCollection = usersDatabase.collections.get('users');
			const hash = await usersDatabase.adapter.getLocal('last_user_hash');
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
			// if (hash) {
			// 	const { user, site, store } = hash;
			// 	// get actual user?
			// 	if (user) {
			// 		setUser(JSON.parse(user));
			// 	}
			// }
		};

		getLastUser();
	}, []);

	const setStoreDB = (obj) => {
		const database = getStoreDatabase(obj);
		_setStoreDB(database);
		usersDatabase.adapter.setLocal('last_user', JSON.stringify(obj));
	};

	return (
		<DatabaseContext.Provider value={{ user, storeDB, setStoreDB }}>
			{children}
		</DatabaseContext.Provider>
	);
};

export default DatabaseProvider;
