import * as React from 'react';
import { from, combineLatest } from 'rxjs';
import { tap, switchMap, filter } from 'rxjs/operators';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { userDB$ } from '@wcpos/common/src/database/users-db';

type UserDocument = import('@wcpos/common/src/database').UserDocument;
type UserDatabase = import('@wcpos/common/src/database').UserDatabase;

interface UserContextProps {
	userResource: ObservableResource<UserDocument>;
	// setUser: React.Dispatch<React.SetStateAction<UserDocument | undefined>>;
	userDB: UserDatabase;
}

// @ts-ignore
export const UserContext = React.createContext<UserContextProps>();

interface UserProviderProps {
	children: React.ReactNode;
}

const userDBResource = new ObservableResource(userDB$, (value: any) => !!value);

// const lastUser$ = userDB$.pipe(switchMap((userDB) => userDB.users.getLocal$('lastUser')));

// const user$ = combineLatest([userDB$, lastUser$]).pipe(
// 	// @ts-ignore
// 	switchMap(([userDB, lastUser]) => {
// 		if (lastUser) {
// 			// @ts-ignore
// 			return from(userDB.users.findOne(lastUser.get('id')).exec());
// 		}
// 		// create default entry
// 		return false;
// 	})
// );

// const userResource = new ObservableResource(user$, (value: any) => !!value);

const UserProvider = ({ children }: UserProviderProps) => {
	const userDB = useObservableSuspense(userDBResource);
	const user$ = userDB.users.getLocal$('lastUser').pipe(
		tap(async (lastUser) => {
			if (!lastUser) {
				// @ts-ignore
				const defaultUser = await userDB.users.insert({ firstName: 'Test', lastName: 'User' });
				const localDoc = await userDB.users.upsertLocal('lastUser', { id: defaultUser.localID });
			}
		}),
		filter((lastUser) => !!lastUser),
		switchMap((lastUser) => {
			const localID = lastUser?.get('id');
			const query = userDB.users.findOne(localID);
			return query.$;
		})
	);

	const userResource = new ObservableResource(user$, (value: any) => !!value);

	// @ts-ignore
	return <UserContext.Provider value={{ userResource, userDB }}>{children}</UserContext.Provider>;
};

export default UserProvider;
