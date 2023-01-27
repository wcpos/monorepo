import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { from } from 'rxjs';
import { catchError, switchMap, filter } from 'rxjs/operators';

import { userDBPromise } from '@wcpos/database/src/users-db';

const userDB$ = from(userDBPromise());
export const userDBResource = new ObservableResource(userDB$, (value: any) => !!value);

const user$ = userDB$.pipe(
	switchMap((userDB) =>
		userDB.getLocal$('current').pipe(
			switchMap(async (current) => {
				const userID = current && current.get('userID');
				/** @NOTE - findOne returns an RxDocument if userID is null | undefined */
				const user = await userDB.users.findOne(userID || '').exec();
				if (!user) {
					/**
					 * Init with Global User
					 * @TODO - what if edge cases, like no current userID but there is a User in the DB?
					 */
					userDB.users.insert({ first_name: 'Global', last_name: 'User' }).then((defaultUser) => {
						return userDB.upsertLocal('current', { userID: defaultUser.uuid });
					});
				}
				return user;
			}),
			/** @NOTE - isRxDocument needs an object */
			filter((user) => isRxDocument(user || {}))
		)
	),
	catchError(() => {
		throw new Error('Error finding global user');
	})
);

export const userResource = new ObservableResource(user$, (value: any) => !!value);
