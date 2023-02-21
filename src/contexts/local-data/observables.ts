import { getLocales } from 'expo-localization';
import { isRxDocument } from 'rxdb';
import { combineLatest, from, of, iif } from 'rxjs';
import {
	catchError,
	switchMap,
	filter,
	withLatestFrom,
	map,
	tap,
	debounceTime,
	distinctUntilChanged,
	shareReplay,
} from 'rxjs/operators';

import { storeDBPromise } from '@wcpos/database/src/stores-db';
import { userDBPromise } from '@wcpos/database/src/users-db';
import log from '@wcpos/utils/src/logger';

import { tx } from '../../lib/translations';
import locales from '../../lib/translations/locales';

/**
 * NOTE - this is subscribed to multiple times,
 * so we need to shareReplay otherwise there is weird behaviour
 */
const userDB$ = from(userDBPromise()).pipe(shareReplay(1));

/**
 * NOTE - this is subscribed to multiple times,
 * so we need to shareReplay otherwise there is weird behaviour
 */
const current$ = userDB$.pipe(
	switchMap((userDB) => userDB.getLocal$('current')),
	shareReplay(1)
);

/**
 * NOTE - this is subscribed to multiple times,
 * so we need to shareReplay otherwise there is weird behaviour
 */
const user$ = current$.pipe(
	switchMap((current) => (current ? current?.get$('userID') : of(null))),
	withLatestFrom(userDB$),
	switchMap(async ([userID, userDB]) => {
		/** NOTE - findOne returns an RxDocument if userID is null | undefined */
		const user = await userDB.users.findOneFix(userID).exec();
		if (!user) {
			/**
			 * Init with Global User
			 * TODO - what if edge cases, like no current userID but there is a User in the DB?
			 */
			userDB.users.insert({ first_name: 'Global', last_name: 'User' }).then((defaultUser) => {
				return userDB.upsertLocal('current', { userID: defaultUser.uuid });
			});
		}
		return user;
	}),
	filter(isRxDocument),
	shareReplay(1)
);

/**
 *
 */
const site$ = current$.pipe(
	switchMap((current) => (current ? current?.get$('siteID') : of(null))),
	withLatestFrom(userDB$),
	switchMap(([siteID, userDB]) => userDB.sites.findOneFix(siteID).exec())
);

/**
 *
 */
const wpCredentials$ = current$.pipe(
	switchMap((current) => (current ? current?.get$('wpCredentialsID') : of(null))),
	withLatestFrom(userDB$),
	switchMap(async ([wpCredentialsID, userDB]) => {
		return userDB.wp_credentials.findOneFix(wpCredentialsID).exec();
	})
);

/**
 *
 */
const store$ = current$.pipe(
	switchMap((current) => (current ? current?.get$('storeID') : of(null))),
	withLatestFrom(userDB$),
	switchMap(async ([storeID, userDB]) => {
		return userDB.stores.findOneFix(storeID).exec();
	})
);

/**
 *
 */
const storeDB$ = store$.pipe(
	switchMap((store) => (store?.localID ? storeDBPromise(store.localID) : Promise.resolve(null)))
);

/**
 * The locale set in the store is loaded preferentially, then user locale, then system locale
 */
/**
 * Convert system locales to our Transifex locales
 */
const systemLocales = getLocales();
const { languageCode, languageTag } = systemLocales[0];
const { locale: systemLocale } =
	locales[languageTag.toLowerCase()] || locales[languageCode] || locales['en'];

const locale$ = combineLatest([user$, store$]).pipe(
	switchMap(([user, store]) => (store ? store.locale$ : user.locale$)),
	withLatestFrom(userDB$),
	switchMap(([localeSetting, userDB]) => {
		const locale = localeSetting || systemLocale;
		return userDB.getLocal$(locale).pipe(
			map((doc) => {
				const translations = isRxDocument(doc) ? doc.toJSON().data : {};
				tx.cache.update(locale, translations, true);
				tx.setCurrentLocale(locale);
				return locale;
			})
		);
	})
);

/**
 *
 */
export const combined$ = combineLatest([
	userDB$,
	user$,
	site$,
	wpCredentials$,
	store$,
	storeDB$,
	locale$,
]).pipe(
	debounceTime(50), // site$, wpCredentials$, store$ and storeDB$ are debounced to avoid multiple calls
	catchError((err) => {
		log.error(err);
		throw new Error('Error hydrating local data');
	})
);
