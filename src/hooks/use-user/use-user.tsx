import * as React from 'react';
import DatabaseService from '@wcpos/common/src/database';

type UserDatabase = import('@wcpos/common/src/database').UserDatabase;
type UserDocument = import('@wcpos/common/src/database').UserDocument;

let userDB: UserDatabase;

/**
 *
 */
export function useUser() {
	const [user, setUser] = React.useState<UserDocument>();

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

	return { user, setUser, userDB };
}
