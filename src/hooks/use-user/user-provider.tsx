import * as React from 'react';
import DatabaseService from '@wcpos/common/src/database';

type UserDocument = import('@wcpos/common/src/database').UserDocument;
type UserDatabase = import('@wcpos/common/src/database').UserDatabase;

interface UserContextProps {
	user?: UserDocument;
	setUser: React.Dispatch<React.SetStateAction<UserDocument | undefined>>;
	userDB?: UserDatabase;
}

export const UserContext = React.createContext<UserContextProps | null>(null);

interface UserProviderProps {
	children: React.ReactNode;
}

let userDB: UserDatabase;

const UserProvider = ({ children }: UserProviderProps) => {
	const [user, setUser] = React.useState<UserDocument | undefined>();

	/**
	 * run effect once to set the User ID
	 */
	React.useEffect(() => {
		(async function init() {
			userDB = await DatabaseService.getUserDB();
			const lastUser = await userDB.users.getLocal('lastUser');

			if (lastUser) {
				// restore last user
				const lastUserDoc = await userDB.users.findOne(lastUser.get('id')).exec();
				if (lastUserDoc) {
					return setUser(lastUserDoc);
				}
			}

			const users = await userDB.users.find().exec();

			if (users.length === 0) {
				// create new user
				// @ts-ignore
				const newUserDoc = await userDB.users.insert({ displayName: 'Test' });
				await userDB.users.upsertLocal('lastUser', { id: newUserDoc.localId });
				return setUser(newUserDoc);
			}

			// else?? set the first found user
			await userDB.users.upsertLocal('lastUser', { id: users[0].localId });
			return setUser(users[0]);
		})();
	}, []);

	return <UserContext.Provider value={{ user, setUser, userDB }}>{children}</UserContext.Provider>;
};

export default UserProvider;
