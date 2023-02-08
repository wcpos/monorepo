import * as React from 'react';

import { getLocales } from 'expo-localization';
import get from 'lodash/get';
import { ObservableResource, useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import log from '@wcpos/utils/src/logger';

import { t, tx } from '../../lib/translations';
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
		const storeOrUserDoc = store || user;
		const language$ = storeOrUserDoc.locale$.pipe(
			map((l) => l || systemLocale),
			tap(async (locale) => {
				const doc = await userDB.getLocal('translations');
				if (doc) {
					const translations = doc.get(locale);
					if (translations) {
						tx.cache.update(locale, translations, true);
					}
				}
				tx.setCurrentLocale(locale);
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
