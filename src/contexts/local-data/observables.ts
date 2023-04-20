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
import { createStoreDB } from '@wcpos/database/src/stores-db';
import { createUserDB } from '@wcpos/database/src/users-db';
import log from '@wcpos/utils/src/logger';

import { tx } from '../../lib/translations';
import locales from '../../lib/translations/locales.json';

export type LocalData = {
	userDB: UserDatabase;
	user: UserDocument;
	site?: SiteDocument;
	wpCredentials?: WPCredentialsDocument;
	store?: StoreDocument;
	storeDB?: StoreDatabase;
	// locale: string;
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
export const current$: Observable<LocalData> = from(createUserDB()).pipe(
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
					storeDB: storeID ? createStoreDB(storeID) : Promise.resolve(null),
				}).pipe(
					/**
					 * There should always be a global user
					 * NOTE: I don't actually use global users at the moment, but might in the future
					 * if user = null, either find the first one or create a new one
					 */
					filter((obj: LocalData) => {
						if (!isRxDocument(obj.user)) {
							handleFirstUser(userDB);
							return false;
						} else {
							return true;
						}
					}),

					// add userDB to the object and return here
					map((obj) => Object.assign(obj, { userDB }))
				)
			)
		)
	),
	catchError((err) => {
		log.error(err);
		throw new Error('Error hydrating current context');
	})
);

/**
 *
 */
export const hydrateWebAppData = (site, wp_credentials, store) => {
	return current$.pipe(
		switchMap(async ({ user, userDB }) => {
			// @ts-ignore
			let siteDoc = await userDB.sites.findOneFix(site.uuid).exec();
			let wpCredentialsDoc = await userDB.wp_credentials
				// @ts-ignore
				.findOneFix(wp_credentials.uuid)
				.exec();
			let storeDoc = await userDB.stores.findOne({ selector: { id: store.id } }).exec();

			if (!siteDoc) {
				// @ts-ignore
				siteDoc = await userDB.sites.insert(site);
			}

			/**
			 * Update nonce for REST requests on each refresh
			 * FIXME: this should be done proactively, ie: check cookie timeout
			 */
			if (wpCredentialsDoc) {
				// @ts-ignore
				wpCredentialsDoc = await wpCredentialsDoc.patch({ wp_nonce: wp_credentials.wp_nonce });
			}

			if (!wpCredentialsDoc) {
				// @ts-ignore
				wpCredentialsDoc = await userDB.wp_credentials.insert(wp_credentials);
			}

			if (!storeDoc) {
				// @ts-ignore
				storeDoc = await userDB.stores.insert(store);
			}

			const storeDB = await createStoreDB(storeDoc.localID);

			return {
				user,
				userDB,
				site: siteDoc,
				wpCredentials: wpCredentialsDoc,
				store: storeDoc,
				storeDB,
			};
		})
	);
};

/**
 * The locale set in the store is loaded preferentially, then user locale
 */
export const hydrateTranslations = (localeSetting$, userDB) => {
	return localeSetting$.pipe(
		switchMap((localeSetting) => {
			const locale = localeSetting || systemLocale;
			return userDB.getLocal$(locale).pipe(
				switchMap((doc) => {
					const translations = isRxDocument(doc) ? doc.toJSON().data : {};
					tx.cache.update(locale, translations, true);
					/**
					 * setCurrentLocale is async, it doesn't update tx.currentLocale immediately
					 * so, we need to wait here for it to finish
					 */
					return tx.setCurrentLocale(locale).catch((err) => {
						// NOTE: catch error silently here so network errors don't break the app
						log.error(err);
					});
				}),
				map(() => locale)
			);
		})
	);
};
