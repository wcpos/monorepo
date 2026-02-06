import * as React from 'react';

import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next';

import { getLogger } from '@wcpos/utils/logger';

import { RxDBBackend } from './rxdb-backend';
import en from './locales/en/core.json';
import { useLocale } from '../../hooks/use-locale';
import { useAppState } from '../app-state';

const log = getLogger(['wcpos', 'translations']);

export const TranslationProvider = ({ children }: { children: React.ReactNode }) => {
	const { translationsState } = useAppState();
	const { locale } = useLocale();

	log.debug('[translations] Render', { context: { locale, hasTranslationsState: !!translationsState } });

	const i18nInstance = React.useMemo(() => {
		log.debug('[translations] Creating i18n instance', { context: { locale } });
		const instance = createInstance();
		instance
			.use(initReactI18next)
			.use(RxDBBackend)
			.init({
				lng: locale,
				fallbackLng: 'en',
				load: 'currentOnly',
				partialBundledLanguages: true,
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
		log.debug('[translations] Language check', { context: { current: i18nInstance.language, target: locale } });
		if (i18nInstance.language !== locale) {
			log.debug('[translations] Changing language', { context: { from: i18nInstance.language, to: locale } });
			i18nInstance.changeLanguage(locale);
		}
	}, [locale, i18nInstance]);

	return <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>;
};

export const useT = () => {
	const { t } = useTranslation();
	return t;
};
