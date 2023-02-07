import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { from, of } from 'rxjs';
import { catchError, switchMap, filter } from 'rxjs/operators';

import { userDBPromise } from '@wcpos/database/src/users-db';
import log from '@wcpos/utils/src/logger';

const userDB$ = from(userDBPromise());
export const userDBResource = new ObservableResource(userDB$, (value: any) => !!value);

const user$ = userDB$.pipe(
	switchMap((userDB) =>
		userDB.getLocal$('current').pipe(
			switchMap((current) => (current ? current?.get$('userID') : of(null))),
			switchMap(async (userID) => {
				/** @NOTE - findOne returns an RxDocument if userID is null | undefined */
				const user = await userDB.users.findOneFix(userID).exec();
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
			filter((user) => isRxDocument(user))
		)
	),
	catchError((err) => {
		log.error(err);
		throw new Error('Error finding global user');
	})
);

export const userResource = new ObservableResource(user$, (value: any) => !!value);
