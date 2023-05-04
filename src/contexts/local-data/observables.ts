import { getLocales } from 'expo-localization';
import { isRxDocument } from 'rxdb';
import { from, forkJoin, Observable, combineLatest, of } from 'rxjs';
import {
	catchError,
	switchMap,
	filter,
	map,
	tap,
	distinctUntilChanged,
	startWith,
	skip,
	shareReplay,
} from 'rxjs/operators';

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

import { getOrInsertSite, getOrInsertStore, getOrInsertWPCredentials } from './helpers';
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
 * make sure userDB comes preloaded with the a Global User (for now)
 */
const userDB$ = from(createUserDB()).pipe(
	switchMap((userDB) => {
		return userDB
			.getLocal$('current')
			.pipe(
				switchMap((current) => userDB.users.findOneFix(current?.get('userID')).exec()),
				filter((user) => {
					if (!isRxDocument(user)) {
						handleFirstUser(userDB);
						return false;
					} else {
						return true;
					}
				})
			)
			.pipe(map(() => userDB));
	}),
	distinctUntilChanged(),
	shareReplay(1)
);

const user$ = userDB$.pipe(
	switchMap((userDB) =>
		userDB
			.getLocal$('current')
			.pipe(switchMap((current) => userDB.users.findOneFix(current?.get('userID')).exec()))
	),
	distinctUntilChanged(),
	shareReplay(1)
);

const site$ = userDB$.pipe(
	switchMap((userDB) =>
		userDB
			.getLocal$('current')
			.pipe(switchMap((current) => userDB.sites.findOneFix(current?.get('siteID')).exec()))
	),
	distinctUntilChanged(),
	shareReplay(1)
);

const wpCredentials$ = userDB$.pipe(
	switchMap((userDB) =>
		userDB
			.getLocal$('current')
			.pipe(
				switchMap((current) =>
					userDB.wp_credentials.findOneFix(current?.get('wpCredentialsID')).exec()
				)
			)
	),
	distinctUntilChanged(),
	shareReplay(1)
);

const store$ = userDB$.pipe(
	switchMap((userDB) =>
		userDB
			.getLocal$('current')
			.pipe(switchMap((current) => userDB.stores.findOneFix(current?.get('storeID')).exec()))
	),
	distinctUntilChanged(),
	shareReplay(1)
);

const storeDB$ = store$.pipe(
	switchMap((store) => (store ? createStoreDB(store.localID) : Promise.resolve(null))),
	distinctUntilChanged(),
	shareReplay(1)
);

/**
 *
 */
export const current$ = combineLatest([
	userDB$,
	user$,
	site$,
	wpCredentials$,
	store$,
	storeDB$,
]).pipe(
	map(([userDB, user, site, wpCredentials, store, storeDB]) => ({
		userDB,
		user,
		site,
		wpCredentials,
		store,
		storeDB,
	})),
	// tap((data) => {
	// 	debugger;
	// }),
	catchError((err) => {
		log.error(err);
		throw new Error('Error hydrating current context');
	})
);

/**
 * FIXME: this is ugly as hell
 */
export const hydrateWebAppData = (site, wp_credentials, stores, store_id) => {
	const webSite$ = userDB$.pipe(
		switchMap(async (userDB) => getOrInsertSite(userDB, site)),
		distinctUntilChanged(),
		shareReplay(1)
	);

	const webCredentials$ = userDB$.pipe(
		switchMap(async (userDB) => getOrInsertWPCredentials(userDB, wp_credentials)),
		distinctUntilChanged(),
		shareReplay(1)
	);

	const webStore$ = combineLatest([
		userDB$,
		webCredentials$,
		store$.pipe(skip(1), startWith(null)),
	]).pipe(
		switchMap(async ([userDB, wpCredentials, store]) => {
			if (store) {
				return store;
			}
			return getOrInsertStore(userDB, wpCredentials, stores, store_id);
		}),
		distinctUntilChanged(),
		shareReplay(1)
	);

	const webStoreDB$ = webStore$.pipe(
		switchMap((store) => (store ? createStoreDB(store.localID) : Promise.resolve(null))),
		distinctUntilChanged(),
		// filter((storeDB) => !!storeDB), there should always be a storeDB
		shareReplay(1)
	);

	return combineLatest([userDB$, user$, webSite$, webCredentials$, webStore$, webStoreDB$]).pipe(
		map(([userDB, user, site, wpCredentials, store, storeDB]) => ({
			userDB,
			user,
			site,
			wpCredentials,
			store,
			storeDB,
		})),
		catchError((err) => {
			log.error(err);
			throw new Error('Error hydrating current context');
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
