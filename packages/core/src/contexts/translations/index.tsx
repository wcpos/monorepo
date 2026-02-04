import * as React from 'react';

import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next';
import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

import { RxDBBackend } from './rxdb-backend';
import { useLocale } from '../../hooks/use-locale';
import { useAppState } from '../app-state';

export const TranslationProvider = ({ children }: { children: React.ReactNode }) => {
	const { translationsState, site } = useAppState();
	const { locale } = useLocale();
	const wcposVersion = useObservableEagerState(site?.wcpos_version$ ?? of(''));

	const i18nInstance = React.useMemo(() => {
		const instance = createInstance();
		instance
			.use(initReactI18next)
			.use(RxDBBackend)
			.init({
				lng: locale,
				// Keys are raw English strings, so the key itself is the fallback
				fallbackLng: false,
				ns: ['core'],
				defaultNS: 'core',
				keySeparator: false,
				nsSeparator: false,
				interpolation: {
					escapeValue: false,
					prefix: '{',
					suffix: '}',
				},
				backend: {
					translationsState,
					version: wcposVersion,
				},
			});
		return instance;
	}, [locale, translationsState, wcposVersion]);

	/**
	 * When the WCPOS version becomes available (fetched via useSiteInfo),
	 * reload translations so the backend can fetch from the correct CDN URL.
	 */
	React.useEffect(() => {
		if (wcposVersion && locale) {
			i18nInstance.reloadResources(locale, 'core');
		}
	}, [wcposVersion, locale, i18nInstance]);

	/**
	 * Handle locale changes.
	 */
	React.useEffect(() => {
		if (i18nInstance.language !== locale) {
			i18nInstance.changeLanguage(locale);
		}
	}, [locale, i18nInstance]);

	return <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>;
};

export const useT = () => {
	const { t } = useTranslation();
	return t;
};
