import { getLocales } from 'expo-localization';
import { isRxDocument } from 'rxdb';
import { from, forkJoin, Observable } from 'rxjs';
import { catchError, switchMap, filter, map, tap } from 'rxjs/operators';

import type {
	UserDatabase,
	UserDocument,
	SiteDocument,
	WPCredentialsDocument,
	StoreDocument,
	StoreDatabase,
} from '@wcpos/database';
import { storeDBPromise } from '@wcpos/database/src/stores-db';
import { userDBPromise } from '@wcpos/database/src/users-db';
import log from '@wcpos/utils/src/logger';

import { tx } from '../../lib/translations';
import locales from '../../lib/translations/locales';

export type LocalData = {
	userDB: UserDatabase;
	user: UserDocument;
	site?: SiteDocument;
	wpCredentials?: WPCredentialsDocument;
	store?: StoreDocument;
	storeDB?: StoreDatabase;
	locale: string;
};

/**
 * Convert system locales to our Transifex locales
 */
const systemLocales = getLocales();
const { languageCode, languageTag } = systemLocales[0];
const { locale: systemLocale } =
	locales[languageTag.toLowerCase()] || locales[languageCode] || locales['en'];

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
};

/**
 *
 */
export const current$ = from(userDBPromise()).pipe(
	switchMap((userDB) =>
		userDB.getLocal$('current').pipe(
			map((current) => ({
				userID: current?.get('userID'),
				siteID: current?.get('siteID'),
				wpCredentialsID: current?.get('wpCredentialsID'),
				storeID: current?.get('storeID'),
			})),
			switchMap(({ userID, siteID, wpCredentialsID, storeID }) =>
				/**
				 * ForkJoin is like a Promise.all, so we fetch all the RxDocs and storeDB in parallel
				 */
				forkJoin({
					user: userDB.users.findOneFix(userID).exec(),
					site: userDB.sites.findOneFix(siteID).exec(),
					wpCredentials: userDB.wp_credentials.findOneFix(wpCredentialsID).exec(),
					store: userDB.stores.findOneFix(storeID).exec(),
					storeDB: storeID ? storeDBPromise(storeID) : Promise.resolve(null),
				}).pipe(
					/**
					 * There should always be a global user
					 * NOTE: I don't actually use global users at the moment, but might in the future
					 * if user = null, either find the first one or create a new one
					 */
					tap(async (obj) => {
						if (!isRxDocument(obj.user)) {
							await handleFirstUser(userDB);
						}
					}),
					filter((obj) => isRxDocument(obj.user)),
					/**
					 * Here we add in the locale from the store
					 * The locale set in the store is loaded preferentially, then user locale
					 */
					switchMap((obj) => {
						const locale$ = obj.store ? obj.store.locale$ : obj.user.locale$;
						return locale$.pipe(
							map((locale) => {
								obj.locale = locale || systemLocale;
								return obj;
							})
						);
					}),
					switchMap((obj) =>
						userDB.getLocal$(obj.locale).pipe(
							map((doc) => {
								const translations = isRxDocument(doc) ? doc.toJSON().data : {};
								tx.cache.update(obj.locale, translations, true);
								tx.setCurrentLocale(obj.locale);
								obj.userDB = userDB; // add userDB to the final object
								return obj;
							})
						)
					)
				)
			)
		)
	),
	catchError((err) => {
		log.error(err);
		throw new Error('Error hydrating current context');
	})
);
