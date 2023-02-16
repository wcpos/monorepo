import * as React from 'react';

import { getLocales } from 'expo-localization';
import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { catchError, map, tap, switchMap } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { tx } from '../../lib/translations';
import locales from '../../lib/translations/locales';
import useAuth from '../auth';

export const LanguageContext = React.createContext<{
	languageResource: ObservableResource<any>;
}>(null);

interface LanguageProviderProps {
	children: React.ReactNode;
}

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
export const LanguageProvider = ({ children }: LanguageProviderProps) => {
	const { user, store, userDB } = useAuth();

	/**
	 * The locale set in the store is loaded preferentially, then user locale, then system locale
	 */
	const value = React.useMemo(() => {
		const locale$ = store ? store.locale$ : user.locale$;
		const language$ = locale$.pipe(
			switchMap((localeSetting) => {
				const locale = localeSetting || systemLocale;
				return userDB.getLocal$(locale).pipe(
					map((doc) => {
						const translations = isRxDocument(doc) ? doc.toJSON().data : {};
						tx.cache.update(locale, translations, true);
						tx.setCurrentLocale(locale);
						return locale;
					})
				);
			}),
			tap((res) => {
				/**
				 * FIXME: it might be good to do a fingerprint of the translations and only update if it has changed
				 * at the moment it will update twice each time the user changes locale
				 */
				log.debug(res);
			}),
			catchError((err) => {
				log.error(err);
			})
		);

		return {
			languageResource: new ObservableResource(language$, (val) => !!val),
		};
	}, [store, user, userDB]);

	/**
	 *
	 */
	return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export default LanguageProvider;
