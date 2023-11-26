import { isRxDocument } from 'rxdb';
import { from } from 'rxjs';
import { switchMap, map, tap, shareReplay } from 'rxjs/operators';

import type { UserDatabase, UserDocument } from '@wcpos/database';
import { createUserDB } from '@wcpos/database/src/users-db';

/**
 *
 */
const handleFirstUser = async (userDB: UserDatabase) => {
	let firstUser = await userDB.users.findOne().exec();
	if (!firstUser) {
		firstUser = await userDB.users.insert({
			first_name: 'Global',
			last_name: 'User',
		});
	}
	await userDB.upsertLocal('current', { userID: firstUser.uuid });
	return firstUser;
};

/**
 *
 */
export const userDB$ = from(createUserDB()).pipe(shareReplay(1));

/**
 *
 */
export const user$ = userDB$.pipe(
	switchMap((userDB) => {
		return userDB.getLocal$('current').pipe(
			switchMap((current) => {
				return userDB.users.findOneFix(current?.get('userID')).exec();
			}),
			switchMap(async (user) => {
				if (isRxDocument(user)) {
					return user;
				}
				const anyUser = await userDB.users.findOne().exec();
				if (isRxDocument(anyUser)) {
					return anyUser;
				}
				const firstUser = await handleFirstUser(userDB);
				return firstUser;
			}),
			map((user) => {
				if (!isRxDocument(user)) {
					throw new Error('User is not an RxDocument');
				}
				return user as UserDocument;
			})
		);
	})
);
