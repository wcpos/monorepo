import * as React from 'react';

import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next';

import { RxDBBackend } from './rxdb-backend';
import en from './locales/en/core.json';
import { useLocale } from '../../hooks/use-locale';
import { useAppState } from '../app-state';

export const TranslationProvider = ({ children }: { children: React.ReactNode }) => {
	const { translationsState } = useAppState();
	const { locale } = useLocale();

	const i18nInstance = React.useMemo(() => {
		const instance = createInstance();
		instance
			.use(initReactI18next)
			.use(RxDBBackend)
			.init({
				lng: locale,
				fallbackLng: 'en',
				load: 'currentOnly',
				ns: ['core'],
				defaultNS: 'core',
				resources: {
					en: { core: en },
				},
				keySeparator: false,
				nsSeparator: false,
				interpolation: {
					escapeValue: false,
					prefix: '{',
					suffix: '}',
				},
				backend: {
					translationsState,
				},
			});
		return instance;
	}, [locale, translationsState]);

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
