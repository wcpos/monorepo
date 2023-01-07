import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { switchMap } from 'rxjs/operators';

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
 * A little map function to convert system locales to Transifex locales
 */
const getLocaleFromCode = (code: string) => {
	let lang = locales[code.toLowerCase()];

	// try the country code only, eg: es-ar -> es
	if (!lang) {
		lang = locales[code.split('-')[0]];
	}

	// default to english
	if (!lang) {
		lang = locales['en'];
	}

	return lang.locale;
};

/**
 * @TODO - get locale from system, eg: native
 */
const useSystemLocale = () => {
	const code =
		(navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage;
	return getLocaleFromCode(code);
};

/**
 *
 */
export const LanguageProvider = ({ children }: LanguageProviderProps) => {
	const { user, store, userDB } = useAuth();
	const systemLocale = useSystemLocale();

	/**
	 *
	 */
	const languageResource = React.useMemo(() => {
		const locale$ = store ? store.locale$ : user.locale$;

		return new ObservableResource(
			locale$.pipe(
				switchMap((locale) => {
					return userDB.getLocal('translations').then((translations) => {
						const localeCode = locale || systemLocale;

						if (translations?.get(localeCode)) {
							tx.cache.update(localeCode, translations?.get(localeCode), true);
						}

						return tx
							.setCurrentLocale(localeCode)
							.catch((err) => {
								/**
								 * @TODO - little hack here to go back to original if there is an error
								 */
								if (localeCode !== tx.getCurrentLocale()) {
									tx.setCurrentLocale('');
								}
								log.error(err);
							})
							.then(() => {
								return localeCode;
							});
					});
				})
			)
		);
	}, [store, user.locale$, userDB, systemLocale]);

	/**
	 *
	 */
	return (
		<LanguageContext.Provider value={{ languageResource }}>{children}</LanguageContext.Provider>
	);
};

export default LanguageProvider;
